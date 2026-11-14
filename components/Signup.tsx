import React, { useEffect, useState } from 'react';
import { AuthShell, AuthField, PasswordInput, GoogleButton, OrDivider, FormMessage, friendlyAuthError } from '../pages/components/AuthShell.tsx';
import { rememberPendingPlan } from '../pages/routes.ts';
import { PLANS } from '../lib/plans.ts';

interface SignupProps {
  onSignup: (email: string, pass: string) => Promise<void>;
  onLoginWithGoogle: () => Promise<void>;
  onSwitchToLogin: () => void;
}

const MIN_PASSWORD = 8;

const Signup: React.FC<SignupProps> = ({ onSignup, onLoginWithGoogle, onSwitchToLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<{ name: string; period: string } | null>(null);

  useEffect(() => {
    // ?plan=premium|ai&period=monthly|yearly from the pricing page → localStorage `cd_pending_plan` for after signup.
    const pending = rememberPendingPlan(window.location.search);
    if (pending) setPendingPlan({ name: PLANS[pending.plan].name, period: pending.period });
  }, []);

  const requireConsent = (): boolean => {
    if (agreed) return true;
    setError('Please accept the Terms of Service and Privacy Policy to continue.');
    return false;
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password || !confirmPassword) {
      setError('Please fill in all fields.');
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
    if (!requireConsent()) return;
    setLoading(true);
    try {
      await onSignup(email.trim(), password);
    } catch (err) {
      setError(friendlyAuthError(err, 'Could not create your account. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    if (!requireConsent()) return;
    setLoading(true);
    try {
      await onLoginWithGoogle();
    } catch (err) {
      setError(friendlyAuthError(err, 'Could not sign up with Google. Please try again.'));
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Create your free account"
      subtitle="Every document type included. No credit card required."
      footer={
        <>
          Already have an account?{' '}
          <button type="button" onClick={onSwitchToLogin} className="min-h-[44px] font-semibold text-primary hover:underline">Log in</button>
        </>
      }
    >
      {pendingPlan ? (
        <p className="mb-5 rounded-xl bg-accent px-3.5 py-2.5 text-sm text-accent-foreground">
          You picked <strong>{pendingPlan.name}</strong>, billed {pendingPlan.period}. Create your account and we’ll take you straight to secure checkout.
        </p>
      ) : null}
      <GoogleButton onClick={handleGoogle} disabled={loading}>Sign up with Google</GoogleButton>
      <OrDivider />
      <form onSubmit={handleSignup} className="space-y-4" noValidate>
        <AuthField id="email" label="Email">
          <input id="email" type="email" className="input h-12 text-[15px]" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} autoComplete="email" required />
        </AuthField>
        <AuthField id="password" label="Password">
          <PasswordInput id="password" placeholder={`At least ${MIN_PASSWORD} characters`} value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} autoComplete="new-password" minLength={MIN_PASSWORD} required aria-describedby="password-hint" />
        </AuthField>
        <AuthField id="confirmPassword" label="Confirm password">
          <PasswordInput id="confirmPassword" placeholder="Type it again" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={loading} autoComplete="new-password" required />
        </AuthField>
        <p id="password-hint" className="sr-only">Use at least {MIN_PASSWORD} characters.</p>
        <label htmlFor="agree" className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-muted-foreground">
          <input
            id="agree"
            type="checkbox"
            checked={agreed}
            onChange={(e) => { setAgreed(e.target.checked); if (e.target.checked) setError(''); }}
            className="mt-0.5 h-5 w-5 flex-none rounded border-input accent-[hsl(var(--primary))]"
          />
          <span>
            I agree to the{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">Terms of Service</a> and{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">Privacy Policy</a>.
          </span>
        </label>
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}
        <button type="submit" className="btn btn-primary h-12 w-full text-[15px]" disabled={loading}>
          {loading ? 'Creating your account…' : 'Create account'}
        </button>
      </form>
    </AuthShell>
  );
};

export default Signup;
