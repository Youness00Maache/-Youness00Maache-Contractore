
import React, { useState, useEffect } from 'react';
import type { UserProfile, EmailTemplate } from '../types';
import { BackArrowIcon, SunIcon, MoonIcon, DropletIcon, LanguageIcon, CreditCardIcon, LogoutIcon, BriefcaseIcon, UploadImageIcon, UserIcon } from './Icons.tsx';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { compressImage } from '../utils/imageCompression.ts';

interface SettingsProps {
    mode: 'settings' | 'profile';
    profile: UserProfile;
    onSave: (profile: UserProfile, logoFile?: File | null, profilePicFile?: File | null) => void;
    onBack: () => void;
    theme: 'light' | 'dark' | 'blue';
    setTheme: (theme: 'light' | 'dark' | 'blue') => void;
    onLogout: () => void;
    onUpgradeClick?: () => void;
}

const languages = [
    "English", "Spanish", "French", "German", "Italian", "Portuguese", "Chinese", "Japanese", "Korean", "Russian"
];

const Settings: React.FC<SettingsProps> = ({ mode, profile: initialProfile, onSave, onBack, theme, setTheme, onLogout, onUpgradeClick }) => {
    const [profile, setProfile] = useState<UserProfile>(initialProfile || {
        id: '', email: '', name: '', companyName: '', logoUrl: '', profilePictureUrl: '', address: '', phone: '', website: '',
        jobTitle: '', subscriptionTier: 'Basic', language: 'English'
    });

    // Files
    // Files
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [profilePicFile, setProfilePicFile] = useState<File | null>(null);

    // Previews
    const [logoPreview, setLogoPreview] = useState<string>(initialProfile?.logoUrl || '');
    const [profilePicPreview, setProfilePicPreview] = useState<string>(initialProfile?.profilePictureUrl || '');

    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');

    useEffect(() => {
        if (initialProfile) {
            setProfile(initialProfile);
            setLogoPreview(initialProfile.logoUrl || '');
            setProfilePicPreview(initialProfile.profilePictureUrl || '');
            if (initialProfile.name) {
                const parts = initialProfile.name.split(' ');
                setFirstName(parts[0]);
                setLastName(parts.slice(1).join(' '));
            }
        }
    }, [initialProfile]);

    useEffect(() => {
        if (mode === 'profile') {
            setProfile(prev => ({ ...prev, name: `${firstName} ${lastName}`.trim() }));
        }
    }, [firstName, lastName, mode]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setProfile(prev => ({ ...prev, [name]: value }));
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'profile') => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            try {
                const compressed = await compressImage(file);
                const previewUrl = URL.createObjectURL(compressed);

                if (type === 'logo') {
                    setLogoFile(compressed);
                    setLogoPreview(previewUrl);
                } else {
                    setProfilePicFile(compressed);
                    setProfilePicPreview(previewUrl);
                }
            } catch (e) {
                console.error("Error compressing image", e);
                alert("Failed to process image");
            }
        }
    };

    useEffect(() => {
        return () => {
            if (logoPreview && logoPreview.startsWith('blob:')) URL.revokeObjectURL(logoPreview);
            if (profilePicPreview && profilePicPreview.startsWith('blob:')) URL.revokeObjectURL(profilePicPreview);
        };
    }, [logoPreview, profilePicPreview]);

    const handleSaveChanges = () => {
        onSave(profile, logoFile, profilePicFile);
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

            <main className="flex-1 overflow-y-auto space-y-6 animate-fade-in-down max-w-3xl mx-auto w-full pb-10">

                {mode === 'settings' && (
                    <>
                        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-card dark:to-card border-blue-200 dark:border-border">
                            <CardHeader><CardTitle className="text-blue-950 dark:text-foreground">Company Information</CardTitle><CardDescription>Update your company details for invoices.</CardDescription></CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="flex flex-col space-y-1.5"><Label htmlFor="companyName">Company Name</Label><Input id="companyName" name="companyName" value={profile.companyName || ''} onChange={handleChange} /></div>
                                    <div className="flex flex-col space-y-1.5"><Label htmlFor="email">Company Email</Label><Input id="email" type="email" name="email" value={profile.email || ''} onChange={handleChange} /></div>
                                    <div className="flex flex-col space-y-1.5"><Label htmlFor="phone">Phone</Label><Input id="phone" type="tel" name="phone" value={profile.phone || ''} onChange={handleChange} /></div>
                                    <div className="flex flex-col space-y-1.5"><Label htmlFor="website">Website</Label><Input id="website" name="website" value={profile.website || ''} onChange={handleChange} /></div>
                                    <div className="md:col-span-2 flex flex-col space-y-1.5"><Label htmlFor="address">Address</Label><Input id="address" name="address" value={profile.address || ''} onChange={handleChange} /></div>

                                    {/* Company Logo Upload */}
                                    <div className="md:col-span-2 flex flex-col space-y-1.5">
                                        <Label htmlFor="logoUrl">Company Logo</Label>
                                        <div className="flex items-start gap-4">
                                            <div className="flex-1">
                                                <div className="relative">
                                                    <Input id="logoUrl" type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'logo')} className="pl-10 pt-2" />
                                                    <UploadImageIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                                </div>
                                                <p className="mt-2 text-xs text-muted-foreground">This logo will appear on all your documents (Invoices, Estimates, etc.).</p>
                                            </div>
                                            {logoPreview && (
                                                <div className="p-2 bg-white/50 dark:bg-muted rounded-md border border-blue-200 dark:border-border">
                                                    <img src={logoPreview} alt="Logo Preview" className="h-16 w-auto object-contain" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="flex justify-end"><Button onClick={handleSaveChanges}>Save Changes</Button></CardFooter>
                        </Card>

                        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-card dark:to-card border-blue-200 dark:border-border">
                            <CardHeader><CardTitle className="text-blue-950 dark:text-foreground">Appearance & Language</CardTitle></CardHeader>
                            <CardContent className="space-y-6">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-2 border border-blue-200 dark:border-border rounded-lg gap-4 bg-white/30 dark:bg-transparent">
                                    <div className="flex flex-col space-y-1"><span className="font-medium flex items-center gap-2 text-blue-900 dark:text-foreground"><SunIcon className="w-4 h-4" /> Theme</span></div>
                                    <div className="flex items-center gap-2 bg-secondary p-1 rounded-lg self-end sm:self-auto">
                                        <button
                                            onClick={() => setTheme('light')}
                                            className={`flex items-center gap-2 px-3 py-2 rounded-md transition-all ${theme === 'light' ? 'bg-card shadow-sm text-primary' : 'text-muted-foreground hover:bg-background/50'}`}
                                            title="Light Mode"
                                        >
                                            <SunIcon className="h-5 w-5" />
                                            <span className="text-xs font-medium hidden sm:inline">Light</span>
                                        </button>
                                        <button
                                            onClick={() => setTheme('blue')}
                                            className={`flex items-center gap-2 px-3 py-2 rounded-md transition-all ${theme === 'blue' ? 'bg-card shadow-sm text-blue-500' : 'text-muted-foreground hover:bg-background/50'}`}
                                            title="Blue Mode"
                                        >
                                            <DropletIcon className="h-5 w-5" />
                                            <span className="text-xs font-medium hidden sm:inline">Blue</span>
                                        </button>
                                        <button
                                            onClick={() => setTheme('dark')}
                                            className={`flex items-center gap-2 px-3 py-2 rounded-md transition-all ${theme === 'dark' ? 'bg-card shadow-sm text-primary' : 'text-muted-foreground hover:bg-background/50'}`}
                                            title="Dark Mode"
                                        >
                                            <MoonIcon className="h-5 w-5" />
                                            <span className="text-xs font-medium hidden sm:inline">Dark</span>
                                        </button>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between p-2 border border-blue-200 dark:border-border rounded-lg bg-white/30 dark:bg-transparent">
                                    <div className="flex flex-col space-y-1"><span className="font-medium flex items-center gap-2 text-blue-900 dark:text-foreground"><LanguageIcon className="w-4 h-4" /> Language</span></div>
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
                        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-card dark:to-card border-blue-200 dark:border-border">
                            <CardHeader><CardTitle className="text-blue-950 dark:text-foreground">Personal Details</CardTitle></CardHeader>
                            <CardContent>
                                <div className="flex flex-col md:flex-row gap-6 mb-6 items-start">
                                    {/* Profile Picture Upload */}
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-blue-200 dark:border-border bg-white dark:bg-muted flex items-center justify-center relative group">
                                            {profilePicPreview ? (
                                                <img src={profilePicPreview} alt="Profile" className="w-full h-full object-cover" />
                                            ) : (
                                                <UserIcon className="w-10 h-10 text-blue-300 dark:text-muted-foreground" />
                                            )}
                                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" onClick={() => document.getElementById('profilePicInput')?.click()}>
                                                <UploadImageIcon className="w-6 h-6 text-white" />
                                            </div>
                                        </div>
                                        <Input id="profilePicInput" type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'profile')} className="hidden" />
                                        <Button variant="ghost" size="sm" onClick={() => document.getElementById('profilePicInput')?.click()} className="text-xs text-blue-600 dark:text-foreground">Change Photo</Button>
                                    </div>

                                    <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="flex flex-col space-y-1.5"><Label htmlFor="firstName">First Name</Label><Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
                                        <div className="flex flex-col space-y-1.5"><Label htmlFor="lastName">Last Name</Label><Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
                                        <div className="flex flex-col space-y-1.5 md:col-span-2">
                                            <Label htmlFor="jobTitle">Job Title</Label>
                                            <div className="relative"><BriefcaseIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input id="jobTitle" name="jobTitle" value={profile.jobTitle || ''} onChange={handleChange} className="pl-9" placeholder="e.g. General Contractor" /></div>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="flex justify-end"><Button onClick={handleSaveChanges}>Save Changes</Button></CardFooter>
                        </Card>

                        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-card dark:to-card border-blue-200 dark:border-border">
                            <CardHeader><CardTitle className="text-blue-950 dark:text-foreground">Subscription Plan</CardTitle></CardHeader>
                            <CardContent>
                                <div className="flex items-center justify-between p-4 border border-blue-200 dark:border-border rounded-lg bg-white/30 dark:bg-card">
                                    <div className="flex items-center gap-4">
                                        <div className={`p-3 rounded-full ${profile.subscriptionTier === 'Premium' ? 'bg-yellow-100 text-yellow-600' : 'bg-blue-100 text-blue-600 dark:bg-gray-100 dark:text-gray-600'}`}><CreditCardIcon className="h-6 w-6" /></div>
                                        <div><h3 className="font-bold text-lg text-blue-900 dark:text-foreground">{profile.subscriptionTier || 'Basic'} Plan</h3><p className="text-sm text-blue-700/70 dark:text-muted-foreground">{profile.subscriptionTier === 'Premium' ? 'You have access to all premium features.' : 'Upgrade to Premium to unlock all features.'}</p></div>
                                    </div>
                                    {profile.subscriptionTier !== 'Premium' && <Button variant="default" onClick={onUpgradeClick}>Upgrade</Button>}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-destructive/50 bg-red-50/50 dark:bg-card">
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
