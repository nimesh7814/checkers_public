import React, { useState, useRef, useCallback } from 'react';
import ReactCrop, { Crop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Upload, X } from 'lucide-react';
import PlayerAvatar from './PlayerAvatar';

interface ImageUploadProps {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  username?: string;
}

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/tiff', 'image/x-icon', 'image/vnd.microsoft.icon'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

const ImageUpload: React.FC<ImageUploadProps> = ({ value, onChange, username = 'User' }) => {
  const [tempImage, setTempImage] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>({ unit: '%', width: 80, height: 80, x: 10, y: 10 });
  const [showCrop, setShowCrop] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    if (!ACCEPTED_TYPES.includes(file.type) && !file.name.match(/\.(tif|tiff|ico)$/i)) {
      setError('Unsupported file format');
      return;
    }

    if (file.size > MAX_SIZE) {
      setError('File size must be under 10 MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setTempImage(reader.result as string);
      setShowCrop(true);
      setCrop({ unit: '%', width: 80, height: 80, x: 10, y: 10 });
    };
    reader.readAsDataURL(file);
  };

  const getCroppedImg = useCallback((): string | null => {
    const img = imgRef.current;
    if (!img || !crop.width || !crop.height) return null;

    const canvas = document.createElement('canvas');
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;

    const pixelCrop: PixelCrop = {
      unit: 'px',
      x: (crop.x || 0) * (crop.unit === '%' ? img.width / 100 : 1),
      y: (crop.y || 0) * (crop.unit === '%' ? img.height / 100 : 1),
      width: crop.width * (crop.unit === '%' ? img.width / 100 : 1),
      height: crop.height * (crop.unit === '%' ? img.height / 100 : 1),
    };

    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(
      img,
      pixelCrop.x * scaleX,
      pixelCrop.y * scaleY,
      pixelCrop.width * scaleX,
      pixelCrop.height * scaleY,
      0, 0, 256, 256
    );

    return canvas.toDataURL('image/jpeg', 0.85);
  }, [crop]);

  const handleSave = () => {
    const cropped = getCroppedImg();
    if (cropped) {
      onChange(cropped);
    }
    setShowCrop(false);
    setTempImage(null);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative cursor-pointer group"
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-border hover:border-primary transition-colors">
          {value ? (
            <img src={value} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <PlayerAvatar username={username} size={96} />
            </div>
          )}
        </div>
        <div className="absolute inset-0 rounded-full bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Upload className="w-6 h-6 text-foreground" />
        </div>
        {value && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(null); }}
            className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-destructive flex items-center justify-center"
          >
            <X className="w-3 h-3 text-destructive-foreground" />
          </button>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.tif,.tiff,.ico"
        className="hidden"
        onChange={handleFile}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Dialog open={showCrop} onOpenChange={setShowCrop}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Crop Profile Picture</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center max-h-[60vh] overflow-auto">
            {tempImage && (
              <ReactCrop
                crop={crop}
                onChange={c => setCrop(c)}
                aspect={1}
                circularCrop
              >
                <img ref={imgRef} src={tempImage} alt="Crop preview" className="max-w-full" />
              </ReactCrop>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowCrop(false)}>Cancel</Button>
            <Button type="button" onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ImageUpload;
