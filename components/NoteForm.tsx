import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { NoteData, UserProfile, Job } from '../types.ts';
import { generateNotePDF } from '../services/pdfGenerator.ts';
import { CameraIcon, UploadImageIcon, BackArrowIcon, ExportIcon, NoteIcon } from './Icons.tsx';
import Toolbar from './Toolbar.tsx';
import AIVoiceInput from './AIVoiceInput.tsx';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import TemplateSelector from './TemplateSelector.tsx';
import { compressImage } from '../utils/imageCompression.ts';

interface NoteFormProps {
  profile: UserProfile;
  job: Job;
  note: NoteData | null;
  onSave: (data: NoteData) => void;
  onBack: () => void;
}

const defaultNote: NoteData = {
  title: '',
  content: '',
  tags: [],
  templateId: 'standard',
  themeColors: { primary: '#000000', secondary: '#666666' }
};

const Modal: React.FC<{onClose: () => void, title: string, children: React.ReactNode, className?: string}> = ({ children, onClose, title, className = 'max-w-sm' }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4" onClick={onClose}>
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

const NoteForm: React.FC<NoteFormProps> = ({ profile, job, note, onSave, onBack }) => {
  const [data, setData] = useState<NoteData>(note || defaultNote);
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeToolbar, setActiveToolbar] = useState<string[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  
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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // State and refs for element resizing
  const [selectedElement, setSelectedElement] = useState<HTMLElement | null>(null);
  const [resizerState, setResizerState] = useState<{top: number, left: number, width: number, height: number} | null>(null);
  const resizeStartRef = useRef<{x: number, y: number, width: number, height: number, aspectRatio: number} | null>(null);
  
  useEffect(() => {
    if (editorRef.current) {
        editorRef.current.innerHTML = data.content;
    }
  }, []);

  // Active State Checker
  const checkActiveState = useCallback(() => {
      if (!document.activeElement || !editorRef.current?.contains(document.activeElement)) return;
      
      const commands = ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList', 'justifyLeft', 'justifyCenter', 'justifyRight'];
      const active = commands.filter(cmd => document.queryCommandState(cmd));
      
      const formatBlock = document.queryCommandValue('formatBlock');
      if (formatBlock) active.push(formatBlock);

      setActiveToolbar(active);
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor) {
        const handleInteraction = () => checkActiveState();
        
        const handleClickLink = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const link = target.closest('a');
            if (link && editor.contains(link)) {
                e.preventDefault();
                e.stopPropagation();
                const href = (link as HTMLAnchorElement).href;
                if (href) {
                    window.open(href, '_blank', 'noopener,noreferrer');
                }
            }
        };

        editor.addEventListener('keyup', handleInteraction);
        editor.addEventListener('mouseup', handleInteraction);
        editor.addEventListener('click', handleInteraction);
        editor.addEventListener('click', handleClickLink);

        return () => {
            editor.removeEventListener('keyup', handleInteraction);
            editor.removeEventListener('mouseup', handleInteraction);
            editor.removeEventListener('click', handleInteraction);
            editor.removeEventListener('click', handleClickLink);
        };
    }
  }, [checkActiveState]);

  // START CAMERA LOGIC
  const startCamera = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          alert("Camera API is not supported in this browser.");
          return;
      }

      try {
          // Check if any video devices exist first
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter(device => device.kind === 'videoinput');
          
          if (videoDevices.length === 0) {
              alert("No camera found on this device.");
              return;
          }

          let stream;
          try {
            // First try to get the environment (rear) camera
            stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment' } 
            });
          } catch (e) {
            // Fallback to any available video device if environment facing mode is not supported (e.g. on laptops)
            console.warn("Environment camera not found, falling back to default video device.");
            stream = await navigator.mediaDevices.getUserMedia({ 
                video: true 
            });
          }
          
          streamRef.current = stream;
          setShowCameraModal(true);
      } catch (err: any) {
          console.error("Error accessing camera:", err);
          if (err.name === 'NotAllowedError') {
              alert("Camera permission denied. Please allow access in settings.");
          } else if (err.name === 'NotFoundError') {
              alert("No camera found.");
          } else {
              alert("Error accessing camera: " + (err.message || "Unknown error"));
          }
      }
  };

  const stopCamera = () => {
      if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
      }
      setShowCameraModal(false);
  };

  // React callback ref to attach stream when modal DOM renders
  const videoCallbackRef = useCallback((node: HTMLVideoElement) => {
      videoRef.current = node;
      if (node && streamRef.current) {
          node.srcObject = streamRef.current;
          node.play().catch(e => console.log("Play error:", e));
      }
  }, [showCameraModal]);

  const capturePhoto = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              ctx.drawImage(video, 0, 0);
              
              canvas.toBlob(async (blob) => {
                  if (blob) {
                      const file = new File([blob], "camera.jpg", { type: "image/jpeg" });
                      try {
                          const compressed = await compressImage(file);
                          const reader = new FileReader();
                          reader.onload = (e) => {
                              if (e.target?.result) insertImageIntoEditor(e.target.result as string);
                          };
                          reader.readAsDataURL(compressed);
                          stopCamera();
                      } catch (e) {
                          alert("Error processing photo");
                      }
                  }
              }, 'image/jpeg', 0.9);
          }
      }
  };
  // END CAMERA LOGIC

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
        if (target.closest('[data-resize-handle]')) return;

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
        checkActiveState(); // Update tool state on click
    };
    
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  // Effect to position the element resizer UI
  useEffect(() => {
    const editor = editorRef.current;
    if (selectedElement && editor) {
        const updateResizerPosition = () => {
            if (!selectedElement || !editorRef.current) {
                setResizerState(null);
                return;
            };
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


  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };
  
  const insertImageIntoEditor = (base64Image: string) => {
    if (editorRef.current) {
        const imgHtml = `<img src="${base64Image}" alt="User content" style="width: 100%; max-width: 100%; height: auto; border-radius: 0.5rem; display: inline-block; vertical-align: top; margin: 2px;" />`;
        editorRef.current.focus();
        document.execCommand('insertHTML', false, imgHtml);
    }
  };

  const handleImageUpload = async (file: File) => {
    if (file) {
        try {
            const compressed = await compressImage(file);
            const reader = new FileReader();
            reader.onload = (event) => {
                const base64Image = event.target?.result as string;
                insertImageIntoEditor(base64Image);
            };
            reader.readAsDataURL(compressed);
        } catch (e) {
            alert('Failed to upload image');
        }
    }
  };

  const handleSave = () => {
    const finalContent = editorRef.current ? editorRef.current.innerHTML : data.content;
    onSave({ ...data, content: finalContent });
  };
  
  const handleDownload = async () => {
    setIsDownloading(true);
    try {
        const finalContent = editorRef.current ? editorRef.current.innerHTML : data.content;
        await generateNotePDF(profile, job, { ...data, content: finalContent }, data.templateId || 'standard');
    } catch(e) {
        console.error(e);
        alert('Error');
    } finally {
        setIsDownloading(false);
    }
  };
  
  const handleEditorCommand = (command: string, value?: any) => {
    editorRef.current?.focus();
    if (command === 'createLink') {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
            setSavedSelection(selection.getRangeAt(0));
            setShowLinkModal(true);
        } else {
            alert("Please select text to create a link.");
        }
    } else if (command === 'insertTable') {
        setShowTableModal(true);
    } else if (command === 'insertColumns') {
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
        document.execCommand(command, false, value);
    }
    checkActiveState();
  };

  const applyLink = () => {
    if (savedSelection && linkUrl) {
        const selection = window.getSelection();
        if (selection) {
            selection.removeAllRanges();
            selection.addRange(savedSelection);
            
            let finalUrl = linkUrl;
            if (!/^https?:\/\//i.test(finalUrl) && !/^mailto:/i.test(finalUrl)) {
                finalUrl = 'https://' + finalUrl;
            }

            // Create basic link using standard command
            document.execCommand('createLink', false, finalUrl);
            
            // Find the created link and apply attributes strictly
            const anchorNode = selection.focusNode; // Cursor often ends inside the link
            let targetEl: HTMLAnchorElement | null = null;
            
            if (anchorNode) {
               if (anchorNode.nodeType === Node.ELEMENT_NODE && (anchorNode as HTMLElement).tagName === 'A') {
                   targetEl = anchorNode as HTMLAnchorElement;
               } else {
                   targetEl = anchorNode.parentElement?.closest('a') || null;
               }
            }

            if (targetEl) {
                targetEl.setAttribute('target', '_blank');
                targetEl.setAttribute('rel', 'noopener noreferrer');
                targetEl.style.color = 'blue';
                targetEl.style.textDecoration = 'underline';
                targetEl.style.cursor = 'pointer';
            }
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
        tableItselfHTML += `<tr style="background-color: ${tableHeaderColor};">`;
        for (let j = 0; j < tableCols; j++) {
            tableItselfHTML += `<th style="border: 1px solid ${tableBorderColor}; padding: 8px; min-width: 40px; font-weight: bold; text-align: left;"><br></th>`;
        }
        tableItselfHTML += '</tr>';

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
      setTimeout(() => {
        document.execCommand('insertText', false, transcript + ' ');
        checkActiveState();
      }, 50);
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
    
    if (newWidth > 20) {
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
            <Modal title="Take Photo" onClose={stopCamera} className="max-w-2xl">
                <div className="space-y-4">
                    {/* Added muted attribute */}
                    <video ref={videoCallbackRef} autoPlay playsInline muted className="w-full h-auto max-h-[60vh] rounded-md bg-black" />
                    <canvas ref={canvasRef} className="hidden" />
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={stopCamera}>Cancel</Button>
                        <Button onClick={capturePhoto}>
                            <CameraIcon className="w-4 h-4 mr-2" />
                            Take Photo
                        </Button>
                    </div>
                </div>
            </Modal>
        )}

        <header className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
             <div className="flex items-center">
                <Button variant="ghost" size="sm" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center mr-3 hover:bg-secondary/80 rounded-full" aria-label="Back">
                    <BackArrowIcon className="h-6 w-6" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-3 tracking-tight">
                        <NoteIcon className="w-6 h-6 text-primary" /> Note
                    </h1>
                </div>
            </div>
        </header>
        <div className="flex-1">
            <div className="max-w-4xl mx-auto">
                 <Card className="animate-fade-in-down">
                    <CardContent className="pt-6">
                        <div className="flex flex-col space-y-1.5 mb-4">
                            <Label htmlFor="title">Title</Label>
                            <Input id="title" name="title" value={data.title} onChange={handleChange} placeholder="Note Title" className="text-lg font-semibold" />
                        </div>

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
                                className="w-full mt-4 p-4 rounded-md bg-input border border-border focus:ring-2 focus:ring-ring focus:outline-none min-h-[300px]"
                                onKeyUp={checkActiveState}
                                onMouseUp={checkActiveState}
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
                                    <button title="Take Picture" className="group w-16 h-16 rounded-xl flex items-center justify-center transition-colors bg-card border border-border hover:bg-secondary" type="button" onClick={startCamera}>
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
                        <div className="pt-4 border-t border-border">
                            <TemplateSelector 
                                 selectedTemplateId={data.templateId || 'standard'} 
                                 onSelectTemplate={(id) => setData(prev => ({ ...prev, templateId: id }))} 
                                 themeColors={data.themeColors}
                                 onColorsChange={(colors) => setData(prev => ({ ...prev, themeColors: colors }))}
                             />
                        </div>
                    </CardContent>
                     <CardFooter className="flex flex-col sm:flex-row gap-2 w-full">
                        <Button variant="outline" onClick={handleSave} className="w-full sm:w-auto order-2 sm:order-1">Save Only</Button>
                        <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto sm:order-2 sm:ml-auto sm:justify-end">
                            <Button variant="secondary" onClick={handleDownload} disabled={isDownloading} className="w-full sm:w-auto">
                                {isDownloading ? '...' : 'Download PDF'}
                            </Button>
                            <Button onClick={async () => { handleSave(); await handleDownload(); }} disabled={isDownloading} className="col-span-2 sm:col-span-1 w-full sm:w-auto">
                                Save & Download
                            </Button>
                        </div>
                    </CardFooter>
                </Card>
            </div>
        </div>
    </div>
  );
};

export default NoteForm;