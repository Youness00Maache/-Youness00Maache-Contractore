
export const compressImage = async (file: File): Promise<File> => {
    // If already small enough, return original
    if (file.size <= 200 * 1024) return file;

    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.src = url;
        
        img.onload = () => {
            URL.revokeObjectURL(url); // Clean up
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            // Scale down dimensions first if massive (helps compression)
            // 1600px is plenty for documents/web
            const MAX_WIDTH = 1600; 
            if (width > MAX_WIDTH) {
                height = (height * MAX_WIDTH) / width;
                width = MAX_WIDTH;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error("Canvas context not available"));
                return;
            }
            ctx.drawImage(img, 0, 0, width, height);

            // Iteratively reduce quality until under 200KB
            let quality = 0.9;
            
            const tryCompress = () => {
                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            reject(new Error("Compression failed"));
                            return;
                        }
                        
                        if (blob.size <= 200 * 1024 || quality <= 0.1) {
                            // Success or min quality reached
                            const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), { type: 'image/jpeg', lastModified: Date.now() });
                            console.log(`Compressed image: ${(file.size/1024).toFixed(0)}KB -> ${(compressedFile.size/1024).toFixed(0)}KB`);
                            resolve(compressedFile);
                        } else {
                            // Try again with lower quality
                            quality -= 0.1;
                            tryCompress();
                        }
                    },
                    'image/jpeg',
                    quality
                );
            };

            tryCompress();
        };
        img.onerror = (err) => {
            URL.revokeObjectURL(url);
            reject(err);
        };
    });
};
