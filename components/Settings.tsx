
import React, { useState, useEffect } from 'react';
import type { UserProfile } from '../types';
import { BackArrowIcon, SunIcon, MoonIcon, LanguageIcon, CreditCardIcon, LogoutIcon, BriefcaseIcon, UploadImageIcon } from './Icons.tsx';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { compressImage } from '../utils/imageCompression.ts';

interface SettingsProps {
  mode: 'settings' | 'profile';
  profile: UserProfile;
  onSave: (profile: UserProfile, logoFile?: File | null) => void;
  onBack: () => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  onLogout: () => void;
}

const languages = [
    "English", "Spanish", "French", "German", "Italian", "Portuguese", "Chinese", "Japanese", "Korean", "Russian"
];

const Settings: React.FC<SettingsProps> = ({ mode, profile: initialProfile, onSave, onBack, theme, setTheme, onLogout }) => {
  const [profile, setProfile] = useState<UserProfile>(initialProfile || {
      id: '', email: '', name: '', companyName: '', logoUrl: '', address: '', phone: '', website: '',
      jobTitle: '', subscriptionTier: 'Basic', language: 'English'
  });
  
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>(initialProfile?.logoUrl || '');
  
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  useEffect(() => {
      if (initialProfile) {
          setProfile(initialProfile);
          setLogoPreview(initialProfile.logoUrl || '');
          if (initialProfile.name) {
              const parts = initialProfile.name.split(' ');
              setFirstName(parts[0]);
              setLastName(parts.slice(1).join(' '));
          }
      }
  }, [initialProfile]);

  useEffect(() => {
      if (mode === 'profile') {
          setProfile(prev => ({...prev, name: `${firstName} ${lastName}`.trim() }));
      }
  }, [firstName, lastName, mode]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setProfile(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      try {
          // Compress before setting
          const compressed = await compressImage(file);
          setLogoFile(compressed);
          const previewUrl = URL.createObjectURL(compressed);
          setLogoPreview(previewUrl);
      } catch (e) {
          console.error("Error compressing logo", e);
          alert("Failed to process image");
      }
    }
  };

  useEffect(() => {
    return () => {
      if (logoPreview && logoPreview.startsWith('blob:')) {
        URL.revokeObjectURL(logoPreview);
      }
    };
  }, [logoPreview]);
  
  const handleSaveChanges = () => {
    onSave(profile, logoFile);
  };

  if (!profile) return <div className="p-8 text-center">Loading...</div>;

  return (
    <div className="w-full h-full bg-background text-foreground flex flex-col p-4 md:p-8">
       <header className="flex items-center pb-4 border-b border-border mb-6 gap-2">
            <Button variant="ghost" size="sm" onClick={onBack} className="w-12 h-12 p-0 flex items-center justify-center" aria-label="Back">
                <BackArrowIcon className="h-9 w-9" />
            </Button>
            <h1 className="text-2xl font-bold">{mode === 'settings' ? 'Settings' : 'My Profile'}</h1>
       </header>

      <main className="flex-1 overflow-y-auto space-y-6 animate-fade-in-down max-w-3xl mx-auto w-full">
        
        {mode === 'settings' && (
            <>
                <Card>
                    <CardHeader><CardTitle>Company Information</CardTitle><CardDescription>Update your company profile.</CardDescription></CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="flex flex-col space-y-1.5"><Label htmlFor="companyName">Company Name</Label><Input id="companyName" name="companyName" value={profile.companyName || ''} onChange={handleChange} /></div>
                            <div className="flex flex-col space-y-1.5"><Label htmlFor="email">Company Email</Label><Input id="email" type="email" name="email" value={profile.email || ''} onChange={handleChange} /></div>
                            <div className="flex flex-col space-y-1.5"><Label htmlFor="phone">Phone</Label><Input id="phone" type="tel" name="phone" value={profile.phone || ''} onChange={handleChange} /></div>
                             <div className="flex flex-col space-y-1.5"><Label htmlFor="website">Website</Label><Input id="website" name="website" value={profile.website || ''} onChange={handleChange} /></div>
                            <div className="md:col-span-2 flex flex-col space-y-1.5"><Label htmlFor="address">Address</Label><Input id="address" name="address" value={profile.address || ''} onChange={handleChange} /></div>
                            <div className="md:col-span-2 flex flex-col space-y-1.5">
                                <Label htmlFor="logoUrl">Company Logo</Label>
                                <div className="flex items-start gap-4">
                                    <div className="flex-1">
                                        <div className="relative">
                                            <Input id="logoUrl" type="file" accept="image/*" onChange={handleFileChange} className="pl-10 pt-2" />
                                            <UploadImageIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                        </div>
                                        <p className="mt-2 text-xs text-muted-foreground">Max 200KB (Auto-compressed).</p>
                                    </div>
                                    {logoPreview && (
                                        <div className="p-2 bg-muted rounded-md border border-border">
                                            <img src={logoPreview} alt="Logo Preview" className="h-16 w-auto object-contain" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter className="flex justify-end"><Button onClick={handleSaveChanges}>Save Changes</Button></CardFooter>
                </Card>

                <Card>
                    <CardHeader><CardTitle>Appearance & Language</CardTitle></CardHeader>
                    <CardContent className="space-y-6">
                         <div className="flex items-center justify-between p-2 border rounded-lg">
                            <div className="flex flex-col space-y-1"><span className="font-medium flex items-center gap-2"><SunIcon className="w-4 h-4"/> Theme</span></div>
                            <div className="flex items-center gap-2 bg-secondary p-1 rounded-lg">
                                <button onClick={() => setTheme('light')} className={`p-2 rounded-md transition-all ${theme === 'light' ? 'bg-card shadow-sm' : 'hover:bg-background/50'}`}><SunIcon className={`h-5 w-5 ${theme === 'light' ? 'text-primary' : 'text-muted-foreground'}`} /></button>
                                <button onClick={() => setTheme('dark')} className={`p-2 rounded-md transition-all ${theme === 'dark' ? 'bg-card shadow-sm' : 'hover:bg-background/50'}`}><MoonIcon className={`h-5 w-5 ${theme === 'dark' ? 'text-primary' : 'text-muted-foreground'}`} /></button>
                            </div>
                        </div>
                         <div className="flex items-center justify-between p-2 border rounded-lg">
                             <div className="flex flex-col space-y-1"><span className="font-medium flex items-center gap-2"><LanguageIcon className="w-4 h-4"/> Language</span></div>
                            <select name="language" value={profile.language || 'English'} onChange={handleChange} className="h-10 rounded-md border border-input bg-background px-3 py-1 text-sm focus:ring-2 focus:ring-ring">
                                {languages.map(lang => <option key={lang} value={lang}>{lang}</option>)}
                            </select>
                         </div>
                    </CardContent>
                     <CardFooter className="flex justify-end"><Button onClick={handleSaveChanges}>Save Changes</Button></CardFooter>
                </Card>
            </>
        )}

        {mode === 'profile' && (
            <>
                <Card>
                    <CardHeader><CardTitle>Personal Details</CardTitle></CardHeader>
                    <CardContent>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="flex flex-col space-y-1.5"><Label htmlFor="firstName">First Name</Label><Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
                             <div className="flex flex-col space-y-1.5"><Label htmlFor="lastName">Last Name</Label><Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
                             <div className="flex flex-col space-y-1.5 md:col-span-2">
                                <Label htmlFor="jobTitle">Job Title</Label>
                                <div className="relative"><BriefcaseIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input id="jobTitle" name="jobTitle" value={profile.jobTitle || ''} onChange={handleChange} className="pl-9" placeholder="e.g. General Contractor" /></div>
                            </div>
                         </div>
                    </CardContent>
                    <CardFooter className="flex justify-end"><Button onClick={handleSaveChanges}>Save Changes</Button></CardFooter>
                </Card>

                <Card>
                    <CardHeader><CardTitle>Subscription Plan</CardTitle></CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between p-4 border border-border rounded-lg bg-card">
                            <div className="flex items-center gap-4">
                                <div className={`p-3 rounded-full ${profile.subscriptionTier === 'Premium' ? 'bg-yellow-100 text-yellow-600' : 'bg-gray-100 text-gray-600'}`}><CreditCardIcon className="h-6 w-6" /></div>
                                <div><h3 className="font-bold text-lg">{profile.subscriptionTier || 'Basic'} Plan</h3><p className="text-sm text-muted-foreground">{profile.subscriptionTier === 'Premium' ? 'You have access to all premium features.' : 'Upgrade to Premium to unlock all features.'}</p></div>
                            </div>
                            {profile.subscriptionTier !== 'Premium' && <Button variant="default">Upgrade</Button>}
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-destructive/50">
                    <CardHeader><CardTitle className="text-destructive flex items-center gap-2"><LogoutIcon className="h-5 w-5" /> Account Actions</CardTitle></CardHeader>
                    <CardContent><div className="flex justify-between items-center"><p className="text-sm text-muted-foreground">Sign out of your account on this device.</p><Button variant="destructive" onClick={onLogout}>Log Out</Button></div></CardContent>
                </Card>
            </>
        )}
      </main>
    </div>
  );
};

export default Settings;
