import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { DailyJobReportData, UserProfile } from '../types.ts';
import { generateDailyJobReportPDF } from '../services/pdfGenerator.ts';
import { CameraIcon, UploadImageIcon, ExportIcon, BackArrowIcon } from './Icons.tsx';
import Toolbar from './Toolbar.tsx';
import AIVoiceInput from './AIVoiceInput.tsx';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';

interface DailyJobReportFormProps {
  profile: UserProfile;
  report: DailyJobReportData | null;
  onSave: (data: DailyJobReportData) => void;
  onBack: () => void;
}

const defaultReport: DailyJobReportData = {
  reportNumber: `DR-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-001`,
  date: new Date().toISOString().split('T')[0],
  weather: '',
  temperature: '',
  logoUrl: '',
  signatureUrl: '',
  content: '',
  projectName: '',
  clientName: '',
  projectAddress: '',
  tags: [],
};

const Modal: React.FC<{onClose: () => void, title: string, children: React.ReactNode, className?: string}> = ({ children, onClose, title, className = 'max-w-sm' }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50" onClick={onClose}>
        <Card className={`w-full ${className}`} onClick={e => e.stopPropagation()}>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent>
                {children}
            </CardContent>
        </Card>
    </div>
);

const DailyJobReportForm: React.FC<DailyJobReportFormProps> = ({ profile, report, onSave, onBack }) => {
  const [data, setData] = useState<DailyJobReportData>(report || defaultReport);
  const [page, setPage] = useState(1);
  const [showExportOptions, setShowExportOptions] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeToolbar, setActiveToolbar] = useState<string[]>([]);
  
  // State for modals
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [savedSelection, setSavedSelection] = useState<Range | null>(null);
  const [showTableModal, setShowTableModal] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);
  const [tableBorderColor, setTableBorderColor] = useState('#cccccc');
  const [tableHeaderColor, setTableHeaderColor] = useState('#f2f2f2');
  const [showTableColorPicker, setShowTableColorPicker] = useState<'border' | 'header' | null>(null);
  const tableColorPickerRef = useRef<HTMLDivElement>(null);

  // New state and refs for camera modal
  const [showCameraModal, setShowCameraModal] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // State and refs for element resizing
  const [selectedElement, setSelectedElement] = useState<HTMLElement | null>(null);
  const [resizerState, setResizerState] = useState<{top: number, left: number, width: number, height: number} | null>(null);
  const resizeStartRef = useRef<{x: number, y: number, width: number, height: number, aspectRatio: number} | null>(null);
  
  useEffect(() => {
    if (page === 2 && editorRef.current) {
        editorRef.current.innerHTML = data.content;
    }
  }, [page, data.content]);

  useEffect(() => {
    const editor = editorRef.current;
    if (page === 2 && editor) {
        const handleClick = (e: MouseEvent) => {
            const targetElement = e.target as HTMLElement;
            // Allow opening links with a simple click
            if (targetElement.tagName === 'A' && editor.contains(targetElement)) {
                e.preventDefault();
                const href = (targetElement as HTMLAnchorElement).href;
                if (href) {
                    window.open(href, '_blank', 'noopener,noreferrer');
                }
            }
        };
        editor.addEventListener('click', handleClick);
        return () => {
            editor.removeEventListener('click', handleClick);
        };
    }
  }, [page]);

  useEffect(() => {
    if (showCameraModal && videoRef.current && streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
    }
  }, [showCameraModal]);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (tableColorPickerRef.current && !tableColorPickerRef.current.contains(event.target as Node)) {
            setShowTableColorPicker(null);
        }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Effect for element selection (images and tables)
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const handleMouseDown = (e: MouseEvent) => {
        const target = e.target as HTMLElement;

        // If clicking on a resize handle, do nothing
        if (target.closest('[data-resize-handle]')) {
            return;
        }

        const targetImage = target.closest('img');
        const tableWrapper = target.closest('div[style*="display: inline-block"]');
        const isTableWrapper = tableWrapper && tableWrapper.querySelector('table');
        
        let elementToSelect: HTMLElement | null = null;

        if (targetImage && editor.contains(targetImage)) {
            elementToSelect = targetImage;
        } else if (isTableWrapper && editor.contains(tableWrapper)) {
            elementToSelect = tableWrapper as HTMLElement;
        }

        setSelectedElement(elementToSelect);
    };
    
    document.addEventListener('mousedown', handleMouseDown);
    
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [page]);

  // Effect to position the element resizer UI
  useEffect(() => {
    const editor = editorRef.current;
    if (selectedElement && editor) {
        const updateResizerPosition = () => {
            if (!selectedElement || !editorRef.current) {
                setResizerState(null);
                return;
            };
            // Ensure the element is still in the DOM
            if (!document.body.contains(selectedElement)) {
                setSelectedElement(null);
                return;
            }
            const elementRect = selectedElement.getBoundingClientRect();
            const editorRect = editorRef.current.getBoundingClientRect();
            
            setResizerState({
                top: editorRef.current.offsetTop + elementRect.top - editorRect.top + editorRef.current.scrollTop,
                left: editorRef.current.offsetLeft + elementRect.left - editorRect.left + editorRef.current.scrollLeft,
                width: elementRect.width,
                height: elementRect.height,
            });
        };

        updateResizerPosition();
        
        const observer = new MutationObserver(updateResizerPosition);
        observer.observe(selectedElement, { attributes: true, attributeFilter: ['style', 'width', 'height', 'src'] });
        
        editor.addEventListener('scroll', updateResizerPosition);
        window.addEventListener('resize', updateResizerPosition);

        return () => {
            observer.disconnect();
            editor.removeEventListener('scroll', updateResizerPosition);
            window.removeEventListener('resize', updateResizerPosition);
        };
    } else {
        setResizerState(null);
    }
  }, [selectedElement]);


  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, field: 'logoUrl' | 'signatureUrl') => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setData(prev => ({ ...prev, [field]: event.target?.result as string }));
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const insertImageIntoEditor = (base64Image: string) => {
    if (editorRef.current) {
        const imgHtml = `<img src="${base64Image}" alt="User content" style="width: 100%; max-width: 100%; height: auto; border-radius: 0.5rem; display: inline-block; vertical-align: top; margin: 2px;" />`;
        editorRef.current.focus();
        document.execCommand('insertHTML', false, imgHtml);
    }
  };

  const handleImageUpload = (file: File) => {
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const base64Image = event.target?.result as string;
            insertImageIntoEditor(base64Image);
        };
        reader.readAsDataURL(file);
    }
  };

  const openCamera = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        streamRef.current = stream;
        setShowCameraModal(true);
    } catch (err) {
        console.error("Error accessing camera:", err);
        alert("Could not access the camera. Please ensure you have granted permission and the camera is not in use by another app.");
    }
  };

  const closeCamera = () => {
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    }
    setShowCameraModal(false);
  };

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        if (context) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

            const dataUrl = canvas.toDataURL('image/jpeg');
            insertImageIntoEditor(dataUrl);
            closeCamera();
        }
    }
  };

  const handleSave = () => {
    const finalContent = editorRef.current ? editorRef.current.innerHTML : data.content;
    onSave({ ...data, content: finalContent });
  };
  
  const handleExport = async (template: 'minimal' | 'bordered' | 'modern') => {
      const finalContent = editorRef.current ? editorRef.current.innerHTML : data.content;
      await generateDailyJobReportPDF(profile, { ...data, content: finalContent }, template);
  };
  
  const handleEditorCommand = (command: string, value?: any) => {
    if (command === 'createLink') {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
            setSavedSelection(selection.getRangeAt(0));
            setShowLinkModal(true);
        } else {
            alert("Please select text to create a link.");
        }
    } else if (command === 'insertTable') {
        editorRef.current?.focus();
        setShowTableModal(true);
    } else if (command === 'insertColumns') {
        editorRef.current?.focus();
        const columnHTML = `
          <div style="display: flex; gap: 1rem; margin: 1rem 0;">
            <div style="flex: 1; min-width: 0; border: 1px dashed var(--border); padding: 0.5rem; border-radius: var(--radius);">
              <p><br></p>
            </div>
            <div style="flex: 1; min-width: 0; border: 1px dashed var(--border); padding: 0.5rem; border-radius: var(--radius);">
              <p><br></p>
            </div>
          </div>
          <p><br></p>
        `;
        document.execCommand('insertHTML', false, columnHTML);
    } else if (command === 'formatBlock' && value === 'blockquote') {
        editorRef.current?.focus();
        const selection = window.getSelection();
        if (selection) {
            const selectedText = selection.toString();
            if (selectedText.length > 0) {
                document.execCommand('insertText', false, `“${selectedText}”`);
            } else {
                document.execCommand('insertText', false, '“”');
                selection.modify('move', 'backward', 'character');
            }
        }
    } else {
        editorRef.current?.focus();
        document.execCommand(command, false, value);
    }
  };

  const applyLink = () => {
    if (savedSelection && linkUrl) {
        const selection = window.getSelection();
        if (selection) {
            selection.removeAllRanges();
            selection.addRange(savedSelection);
            
            // Ensure URL has a protocol to be a valid, absolute link
            let finalUrl = linkUrl;
            if (!/^https?:\/\//i.test(finalUrl) && !/^mailto:/i.test(finalUrl)) {
                finalUrl = 'https://' + finalUrl;
            }

            document.execCommand('createLink', false, finalUrl);
        }
    }
    setShowLinkModal(false);
    setLinkUrl('');
    setSavedSelection(null);
  };

  const colors = [
    '#ffffff', '#000000', '#e60000', '#ff9900', '#ffff00', '#008a00', '#0066cc', '#9933ff',
    '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#cfe2f3', '#d9d2e9', '#ead1dc',
    '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#9fc5e8', '#b4a7d6', '#d5a6bd',
    '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6fa8dc', '#8e7cc3', '#c27ba0',
    '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3d85c6', '#674ea7', '#a64d79',
    '#990000', '#b45f06', '#bf9000', '#38761d', '#134f5c', '#0b5394', '#351c75', '#741b47',
  ];

  const insertTable = () => {
    if (editorRef.current) {
        let tableItselfHTML = `<table style="border-collapse: collapse; width: 100%; border: 1px solid ${tableBorderColor};"><tbody>`;
        // Header Row
        tableItselfHTML += `<tr style="background-color: ${tableHeaderColor};">`;
        for (let j = 0; j < tableCols; j++) {
            tableItselfHTML += `<th style="border: 1px solid ${tableBorderColor}; padding: 8px; min-width: 40px; font-weight: bold; text-align: left;"><br></th>`;
        }
        tableItselfHTML += '</tr>';

        // Body Rows
        for (let i = 1; i < tableRows; i++) {
            tableItselfHTML += '<tr>';
            for (let j = 0; j < tableCols; j++) {
                tableItselfHTML += `<td style="border: 1px solid ${tableBorderColor}; padding: 8px; min-width: 40px;"><br></td>`;
            }
            tableItselfHTML += '</tr>';
        }
        tableItselfHTML += '</tbody></table>';

        const tableWrapperHTML = `<div style="display: inline-block; vertical-align: top; width: 100%; margin: 2px; max-width:100%;">${tableItselfHTML}</div>`;

        editorRef.current.focus();
        document.execCommand('insertHTML', false, tableWrapperHTML);
    }
    setShowTableModal(false);
    setTableRows(3);
    setTableCols(3);
    setTableBorderColor('#cccccc');
    setTableHeaderColor('#f2f2f2');
  };

  const toggleActiveToolbar = (button: string) => {
    setActiveToolbar((prev) =>
      prev.includes(button)
        ? prev.filter((b) => b !== button)
        : [...prev, button]
    );
  };
  
  const handleVoiceInput = useCallback((transcript: string) => {
    if (editorRef.current) {
      editorRef.current.focus();
      document.execCommand('insertText', false, transcript + ' ');
    }
  }, []);

  const handleResizeMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (!selectedElement) return;

    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: selectedElement.offsetWidth,
      height: selectedElement.offsetHeight,
      aspectRatio: selectedElement.offsetWidth / selectedElement.offsetHeight,
    };

    document.addEventListener('mousemove', handleResizeMouseMove);
    document.addEventListener('mouseup', handleResizeMouseUp);
  };

  const handleResizeMouseMove = useCallback((e: MouseEvent) => {
    if (!resizeStartRef.current || !selectedElement) return;
    
    const { x, width, aspectRatio } = resizeStartRef.current;
    
    const dx = e.clientX - x;
    const newWidth = width + dx;
    
    if (newWidth > 20) { // minimum width
      const newHeight = newWidth / aspectRatio;
      selectedElement.style.width = `${newWidth}px`;
      selectedElement.style.height = `${newHeight}px`;
    }
  }, [selectedElement]);

  const handleResizeMouseUp = useCallback(() => {
    document.removeEventListener('mousemove', handleResizeMouseMove);
    document.removeEventListener('mouseup', handleResizeMouseUp);
    resizeStartRef.current = null;
    
    if (editorRef.current) {
        setData(prev => ({...prev, content: editorRef.current!.innerHTML }));
    }
  }, [handleResizeMouseMove]);

  const renderPageOne = () => (
    <Card>
      <CardHeader>
        <CardTitle>Daily Job Report Details</CardTitle>
        <CardDescription>Fill in the project and weather details for today's report.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="projectName">Project Name</Label>
            <Input id="projectName" name="projectName" value={data.projectName} onChange={handleChange} />
          </div>
          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="clientName">Client Name</Label>
            <Input id="clientName" name="clientName" value={data.clientName} onChange={handleChange} />
          </div>
          <div className="md:col-span-2 flex flex-col space-y-1.5">
              <Label htmlFor="projectAddress">Project Address</Label>
              <Input id="projectAddress" name="projectAddress" value={data.projectAddress} onChange={handleChange} />
          </div>
          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="reportNumber">Report #</Label>
            <Input id="reportNumber" name="reportNumber" value={data.reportNumber} onChange={handleChange} />
          </div>
           <div className="flex flex-col space-y-1.5">
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" name="date" value={data.date} onChange={handleChange} />
          </div>
          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="weather">Weather</Label>
            <Input id="weather" name="weather" value={data.weather} onChange={handleChange} placeholder="e.g., Sunny, Cloudy" />
          </div>
          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="temperature">Temperature (°F)</Label>
            <Input id="temperature" name="temperature" value={data.temperature} onChange={handleChange} placeholder="e.g., 75°F" />
          </div>
           <div className="md:col-span-2 flex flex-col space-y-1.5">
              <Label htmlFor="logoUrl">Company Logo</Label>
              <Input id="logoUrl" type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'logoUrl')} className="pt-2" />
              {data.logoUrl && <img src={data.logoUrl} alt="Logo Preview" className="mt-2 h-16 w-auto object-contain bg-white p-1 rounded-md" />}
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex justify-end space-x-2">
        <Button variant="outline" onClick={onBack}>Cancel</Button>
        <Button onClick={() => setPage(2)}>Next</Button>
      </CardFooter>
    </Card>
  );

  const renderPageTwo = () => (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col h-full relative">
            <Toolbar 
                activeButtons={activeToolbar}
                onCommand={handleEditorCommand}
                toggleActiveButton={toggleActiveToolbar}
            />
            <div 
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                className="w-full mt-4 p-4 rounded-md bg-input border border-border focus:ring-2 focus:ring-ring focus:outline-none overflow-y-auto"
                style={{minHeight: '300px'}}
            >
            </div>
             {resizerState && (
                <div
                    style={{
                        position: 'absolute',
                        top: resizerState.top,
                        left: resizerState.left,
                        width: resizerState.width,
                        height: resizerState.height,
                        border: '2px solid var(--primary)',
                        pointerEvents: 'none',
                        boxSizing: 'border-box',
                    }}
                >
                    <div
                        data-resize-handle="bottom-right"
                        onMouseDown={handleResizeMouseDown}
                        style={{
                            position: 'absolute',
                            bottom: -6,
                            right: -6,
                            width: 12,
                            height: 12,
                            backgroundColor: 'var(--card)',
                            border: '2px solid var(--primary)',
                            borderRadius: '50%',
                            cursor: 'se-resize',
                            pointerEvents: 'auto',
                        }}
                    />
                </div>
            )}
            <div className="w-full py-4 flex items-start justify-center gap-4 md:gap-8">
                <div className="flex flex-col items-center gap-2 text-center">
                    <button title="Take Picture" className="group w-16 h-16 rounded-xl flex items-center justify-center transition-colors bg-card border border-border hover:bg-secondary" type="button" onClick={openCamera}>
                        <CameraIcon className="w-6 h-6 text-foreground/70" />
                    </button>
                    <p className="h-4 text-xs text-foreground/70">Camera</p>
                </div>
                <AIVoiceInput onTranscript={handleVoiceInput} />
                <div className="flex flex-col items-center gap-2 text-center">
                    <input type="file" accept="image/*" ref={fileInputRef} onChange={(e) => e.target.files && handleImageUpload(e.target.files[0])} className="hidden" />
                    <button title="Upload Image" className="group w-16 h-16 rounded-xl flex items-center justify-center transition-colors bg-card border border-border hover:bg-secondary" type="button" onClick={() => fileInputRef.current?.click()}>
                        <UploadImageIcon className="w-6 h-6 text-foreground/70" />
                    </button>
                    <p className="h-4 text-xs text-foreground/70">Upload</p>
                </div>
            </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="w-full h-full bg-background text-foreground flex flex-col p-4 md:p-8">
        {showLinkModal && (
            <Modal title="Add Link" onClose={() => setShowLinkModal(false)}>
                <div className="space-y-4">
                    <Label htmlFor="linkUrl">URL</Label>
                    <Input id="linkUrl" type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://example.com" />
                    <p className="text-xs text-muted-foreground pt-1">Tip: Hold Ctrl (or Cmd) and click a link in the editor to open it.</p>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setShowLinkModal(false)}>Cancel</Button>
                        <Button onClick={applyLink}>Apply</Button>
                    </div>
                </div>
            </Modal>
        )}
        {showTableModal && (
            <Modal title="Insert Table" onClose={() => setShowTableModal(false)}>
                <div className="space-y-4">
                    <div className="flex items-center gap-4">
                        <div className="flex-1">
                            <Label htmlFor="tableRows">Rows</Label>
                            <Input id="tableRows" type="number" value={tableRows} onChange={(e) => setTableRows(Math.max(1, parseInt(e.target.value, 10)))} min="1" />
                        </div>
                        <div className="flex-1">
                            <Label htmlFor="tableCols">Columns</Label>
                            <Input id="tableCols" type="number" value={tableCols} onChange={(e) => setTableCols(Math.max(1, parseInt(e.target.value, 10)))} min="1" />
                        </div>
                    </div>
                     <div ref={tableColorPickerRef}>
                        <div className="flex items-center gap-4 pt-2">
                            <div className="flex-1 space-y-1.5">
                                <Label>Border Color</Label>
                                <div className="relative">
                                    <button 
                                        className="w-full h-10 rounded-md border border-input flex items-center px-3 text-left"
                                        onClick={() => setShowTableColorPicker(prev => prev === 'border' ? null : 'border')}
                                    >
                                        <div className="w-6 h-6 rounded-full border" style={{ backgroundColor: tableBorderColor }}></div>
                                        <span className="ml-2 text-sm">{tableBorderColor}</span>
                                    </button>
                                    {showTableColorPicker === 'border' && (
                                        <div className="absolute top-12 left-0 w-48 bg-popover border border-border rounded-md shadow-lg z-20 p-2">
                                            <div className='grid grid-cols-7 gap-1'>
                                                {colors.map(color => (
                                                    <button
                                                        key={color}
                                                        onClick={() => { setTableBorderColor(color); setShowTableColorPicker(null); }}
                                                        className="w-5 h-5 rounded-full border border-border/20 transition-transform hover:scale-110"
                                                        style={{ backgroundColor: color }}
                                                        aria-label={color}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex-1 space-y-1.5">
                                <Label>Header Color</Label>
                                <div className="relative">
                                    <button 
                                         className="w-full h-10 rounded-md border border-input flex items-center px-3 text-left"
                                         onClick={() => setShowTableColorPicker(prev => prev === 'header' ? null : 'header')}
                                    >
                                        <div className="w-6 h-6 rounded-full border" style={{ backgroundColor: tableHeaderColor }}></div>
                                        <span className="ml-2 text-sm">{tableHeaderColor}</span>
                                    </button>
                                    {showTableColorPicker === 'header' && (
                                        <div className="absolute top-12 left-0 w-48 bg-popover border border-border rounded-md shadow-lg z-20 p-2">
                                            <div className='grid grid-cols-7 gap-1'>
                                                {colors.map(color => (
                                                    <button
                                                        key={color}
                                                        onClick={() => { setTableHeaderColor(color); setShowTableColorPicker(null); }}
                                                        className="w-5 h-5 rounded-full border border-border/20 transition-transform hover:scale-110"
                                                        style={{ backgroundColor: color }}
                                                        aria-label={color}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setShowTableModal(false)}>Cancel</Button>
                        <Button onClick={insertTable}>Insert</Button>
                    </div>
                </div>
            </Modal>
        )}
        {showCameraModal && (
            <Modal title="Take Photo" onClose={closeCamera} className="max-w-2xl">
                <div className="space-y-4">
                    <video ref={videoRef} autoPlay playsInline className="w-full h-auto max-h-[60vh] rounded-md bg-black" />
                    <canvas ref={canvasRef} className="hidden" />
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={closeCamera}>Cancel</Button>
                        <Button onClick={takePhoto}>
                            <CameraIcon className="w-4 h-4 mr-2" />
                            Take Photo
                        </Button>
                    </div>
                </div>
            </Modal>
        )}

        <header className="grid grid-cols-3 items-center pb-4 border-b border-border mb-4">
            <div className="flex justify-start">
                <Button variant="ghost" size="sm" onClick={page === 1 ? onBack : () => setPage(1)} className="w-12 h-12 p-0 flex items-center justify-center" aria-label="Back">
                    <BackArrowIcon className="h-9 w-9" />
                </Button>
            </div>
            <h1 className="text-xl font-bold text-center whitespace-nowrap">Daily Job Report</h1>
            <div className="flex items-center gap-2 justify-end">
                {page === 2 && (
                    <>
                        <Button onClick={handleSave}>Save</Button>
                        <div className="relative">
                            <Button variant="secondary" size="sm" onClick={() => setShowExportOptions(prev => !prev)} className="flex items-center gap-2">
                                <ExportIcon className="h-4 w-4" />
                                <span>Export</span>
                            </Button>
                            {showExportOptions && (
                                <div className="absolute right-0 mt-2 w-48 bg-popover border border-border rounded-md shadow-lg z-10">
                                    <button onClick={() => { handleExport('modern'); setShowExportOptions(false); }} className="block w-full text-left px-4 py-2 text-sm text-popover-foreground hover:bg-accent rounded-t-md">Modern PDF</button>
                                    <button onClick={() => { handleExport('bordered'); setShowExportOptions(false); }} className="block w-full text-left px-4 py-2 text-sm text-popover-foreground hover:bg-accent">Bordered PDF</button>
                                    <button onClick={() => { handleExport('minimal'); setShowExportOptions(false); }} className="block w-full text-left px-4 py-2 text-sm text-popover-foreground hover:bg-accent rounded-b-md">Minimal PDF</button>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </header>
        <div className="flex-1">
            <div className="max-w-4xl mx-auto">
                {page === 1 ? renderPageOne() : renderPageTwo()}
            </div>
        </div>
    </div>
  );
};

export default DailyJobReportForm;