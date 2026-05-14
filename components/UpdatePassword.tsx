import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/Card.tsx';
import { Label } from './ui/Label.tsx';
import { Input } from './ui/Input.tsx';
import { Button } from './ui/Button.tsx';
import { EyeIcon, EyeOffIcon, AppLogo } from './Icons.tsx';

interface UpdatePasswordProps {
    onUpdatePassword: (password: string) => Promise<void>;
}

const UpdatePassword: React.FC<UpdatePasswordProps> = ({ onUpdatePassword }) => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!password || !confirmPassword) {
            setError('Please enter and confirm your new password.');
            return;
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        if (password.length < 6) {
            setError('Password must be at least 6 characters long.');
            return;
        }

        setLoading(true);
        try {
            await onUpdatePassword(password);
        } catch (err: any) {
            setError(err.message || 'Failed to update password.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-background p-4">
            <div className="flex flex-col items-center text-center w-full max-w-sm">
                <div className="mb-6 flex flex-col items-center">
                    <AppLogo className="w-24 h-24 mb-4 drop-shadow-xl" />
                    <h1 className="text-4xl font-bold mb-2 tracking-tight">ContractorDocs</h1>
                    <p className="text-muted-foreground">Set your new password</p>
                </div>
                <Card className="w-full">
                    <form onSubmit={handleSubmit}>
                        <CardHeader>
                            <CardTitle>Update Password</CardTitle>
                            <CardDescription>Enter your new password below.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-col space-y-1.5 text-left">
                                <Label htmlFor="new-password">New Password</Label>
                                <div className="relative">
                                    <Input
                                        id="new-password"
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        disabled={loading}
                                        className="pr-10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                                        aria-label={showPassword ? "Hide password" : "Show password"}
                                    >
                                        {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>
                            <div className="flex flex-col space-y-1.5 text-left">
                                <Label htmlFor="confirm-password">Confirm Password</Label>
                                <div className="relative">
                                    <Input
                                        id="confirm-password"
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="••••••••"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        disabled={loading}
                                        className="pr-10"
                                    />
                                </div>
                            </div>
                            {error && <p className="text-sm text-destructive">{error}</p>}
                        </CardContent>
                        <CardFooter>
                            <Button type="submit" className="w-full" disabled={loading}>
                                {loading ? 'Updating...' : 'Update Password'}
                            </Button>
                        </CardFooter>
                    </form>
                </Card>
            </div>
        </div>
    );
};

export default UpdatePassword;
