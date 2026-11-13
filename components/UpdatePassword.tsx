import React, { useState } from 'react';
import { AuthShell, AuthField, PasswordInput, FormMessage, friendlyAuthError } from '../pages/components/AuthShell.tsx';

interface UpdatePasswordProps {
  onUpdatePassword: (password: string) => Promise<void>;
}

const MIN_PASSWORD = 8;

const UpdatePassword: React.FC<UpdatePasswordProps> = ({ onUpdatePassword }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!password || !confirmPassword) {
      setError('Enter and confirm your new password.');
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters for your password.`);
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords don’t match.');
      return;
    }
    setLoading(true);
    try {
      await onUpdatePassword(password);
    } catch (err) {
      setError(friendlyAuthError(err, 'Could not update your password. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="You’ll use it the next time you log in."
      aside={{
        heading: 'Back to work in a moment',
        points: ['Your jobs, clients and documents are safe', 'Use a password you don’t use anywhere else', 'Or sign in with Google next time'],
      }}
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <AuthField id="new-password" label="New password">
          <PasswordInput id="new-password" placeholder={`At least ${MIN_PASSWORD} characters`} value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} autoComplete="new-password" minLength={MIN_PASSWORD} required autoFocus />
        </AuthField>
        <AuthField id="confirm-password" label="Confirm new password">
          <PasswordInput id="confirm-password" placeholder="Type it again" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={loading} autoComplete="new-password" required />
        </AuthField>
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}
        <button type="submit" className="btn btn-primary h-12 w-full text-[15px]" disabled={loading}>
          {loading ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </AuthShell>
  );
};

export default UpdatePassword;
