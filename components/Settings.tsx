import React from 'react';
import type { UserProfile } from '../types';
// FIX: Added .tsx extension to the import path to resolve the module error.
import { BackArrowIcon } from './Icons.tsx';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';

interface SettingsProps {
  profile: UserProfile;
  setProfile: React.Dispatch<React.SetStateAction<UserProfile>>;
  onBack: () => void;
}

const Settings: React.FC<SettingsProps> = ({ profile, setProfile, onBack }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setProfile(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="w-full h-full bg-background text-foreground flex flex-col">
       <header className="flex items-center p-4 border-b border-border">
        <Button variant="ghost" size="sm" onClick={onBack} className="w-12 h-12 p-0 rounded-full flex items-center justify-center" aria-label="Back">
            <BackArrowIcon className="h-9 w-9" />
        </Button>
        <h1 className="text-xl font-bold mx-auto">Settings</h1>
        <div className="w-12"></div> {/* Spacer */}
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <Card className="max-w-4xl mx-auto">
          <CardHeader>
            <CardTitle>Company Information</CardTitle>
            <CardDescription>Update your company profile and contact details. This information will appear on your documents.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="companyName">Company Name</Label>
                <Input
                  id="companyName"
                  name="companyName"
                  value={profile.companyName}
                  onChange={handleChange}
                />
              </div>
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="name">Contact Name</Label>
                <Input
                  id="name"
                  name="name"
                  value={profile.name}
                  onChange={handleChange}
                />
              </div>
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  name="email"
                  value={profile.email}
                  onChange={handleChange}
                />
              </div>
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  name="phone"
                  value={profile.phone}
                  onChange={handleChange}
                />
              </div>
              <div className="md:col-span-2 flex flex-col space-y-1.5">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  name="address"
                  value={profile.address}
                  onChange={handleChange}
                />
              </div>
               <div className="md:col-span-2 flex flex-col space-y-1.5">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  name="website"
                  value={profile.website}
                  onChange={handleChange}
                />
              </div>
              <div className="md:col-span-2 flex flex-col space-y-1.5">
                <Label htmlFor="logoUrl">Logo URL</Label>
                <Input
                  id="logoUrl"
                  name="logoUrl"
                  value={profile.logoUrl}
                  onChange={handleChange}
                  placeholder="https://example.com/logo.png"
                />
                 <p className="mt-2 text-xs text-muted-foreground">Enter a direct URL to your company logo. For best PDF results, use a publicly accessible image.</p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end">
             <Button>Save Changes</Button>
          </CardFooter>
        </Card>
      </main>
    </div>
  );
};

export default Settings;