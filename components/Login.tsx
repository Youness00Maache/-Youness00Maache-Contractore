import React, { useEffect, useState } from 'react';
import { AuthShell, AuthField, PasswordInput, GoogleButton, OrDivider, FormMessage, friendlyAuthError } from '../pages/components/AuthShell.tsx';
import { rememberPendingPlan } from '../pages/routes.ts';
import { takeLoginPrefill } from '../lib/pendingPlan.ts';
import { PLANS } from '../lib/plans.ts';

interface LoginProps {
  onLogin: (email: string, pass: string) => Promise<void>;
  onLoginWithGoogle: () => Promise<void>;
  onSwitchToSignup: () => void;
  onResetPassword: (email: string) => Promise<void>;
  /** Optional: prefill the email field (e.g. after signup). */
  initialEmail?: string;
}

const Login: React.FC<LoginProps> = ({ onLogin, onLoginWithGoogle, onSwitchToSignup, onResetPassword, initialEmail = '' }) => {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'reset'>('login');
  const [resetSent, setResetSent] = useState('');
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  /** Signup found an existing account for this email: prefilled + explained. */
  const [existingAccount, setExistingAccount] = useState(false);

  useEffect(() => {
    const pending = rememberPendingPlan(window.location.search);
    if (pending) setPendingPlan(`${PLANS[pending.plan].name} (${pending.period})`);
    const prefill = takeLoginPrefill();
    if (prefill?.email) {
      setEmail(prefill.email);
      setExistingAccount(prefill.existing);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await onLogin(email.trim(), password);
    } catch (err) {
      setError(friendlyAuthError(err, 'Could not log in. Please check your details and try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResetSent('');
    if (!email.trim()) {
      setError('Enter the email address you signed up with.');
      return;
    }
    setLoading(true);
    try {
      await onResetPassword(email.trim());
      setResetSent(`If an account exists for ${email.trim()}, a reset link is on its way. Check your inbox and spam folder.`);
    } catch (err) {
      setError(friendlyAuthError(err, 'Could not send the reset link. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setLoading(true);
    try {
      await onLoginWithGoogle();
    } catch (err) {
      setError(friendlyAuthError(err, 'Could not sign in with Google. Please try again.'));
      setLoading(false);
    }
  };

  if (mode === 'reset') {
    return (
      <AuthShell
        title="Reset your password"
        subtitle="Enter your account email and we’ll send you a link to choose a new password."
        footer={
          <button type="button" className="min-h-[44px] font-semibold text-primary hover:underline" onClick={() => { setMode('login'); setError(''); setResetSent(''); }}>
            Back to log in
          </button>
        }
      >
        <form onSubmit={handleReset} className="space-y-4" noValidate>
          <AuthField id="reset-email" label="Email">
            <input id="reset-email" type="email" className="input h-12 text-[15px]" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} autoComplete="email" autoFocus required />
          </AuthField>
          {error ? <FormMessage tone="error">{error}</FormMessage> : null}
          {resetSent ? <FormMessage tone="success">{resetSent}</FormMessage> : null}
          <button type="submit" className="btn btn-primary h-12 w-full text-[15px]" disabled={loading}>
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to your ContractorDocs account."
      footer={
        <>
          New to ContractorDocs?{' '}
          <button type="button" onClick={onSwitchToSignup} className="min-h-[44px] font-semibold text-primary hover:underline">Create a free account</button>
        </>
      }
    >
      {pendingPlan ? (
        <p className="mb-5 rounded-xl bg-accent px-3.5 py-2.5 text-sm text-accent-foreground">
          {existingAccount ? <>You already have an account. Log in to continue to <strong>{pendingPlan}</strong>.</> : <>Log in to continue to <strong>{pendingPlan}</strong>. We’ll take you straight to secure checkout.</>}
        </p>
      ) : existingAccount ? (
        <p className="mb-5 rounded-xl bg-accent px-3.5 py-2.5 text-sm text-accent-foreground">You already have an account with this email. Log in to continue.</p>
      ) : null}
      <GoogleButton onClick={handleGoogle} disabled={loading}>Continue with Google</GoogleButton>
      <OrDivider />
      <form onSubmit={handleLogin} className="space-y-4" noValidate>
        <AuthField id="email" label="Email">
          <input id="email" type="email" className="input h-12 text-[15px]" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} autoComplete="email" required />
        </AuthField>
        <AuthField
          id="password"
          label="Password"
          right={
            <button type="button" onClick={() => { setMode('reset'); setError(''); }} className="text-sm font-medium text-primary hover:underline">
              Forgot password?
            </button>
          }
        >
          <PasswordInput id="password" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} autoComplete="current-password" required />
        </AuthField>
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}
        <button type="submit" className="btn btn-primary h-12 w-full text-[15px]" disabled={loading}>
          {loading ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </AuthShell>
  );
};

export default Login;
