import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth, RegisterData } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { countries } from '@/data/countries';
import ImageUpload from '@/components/ImageUpload';
import CountryFlag from '@/components/CountryFlag';
import { Crown, Eye, EyeOff, ChevronDown } from 'lucide-react';

type AvailabilityStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'error';

type AvailabilityState = {
  status: AvailabilityStatus;
  message: string;
};

type AvailabilityResponse = {
  username?: {
    available: boolean;
    message: string;
  };
  email?: {
    available: boolean;
    message: string;
  };
};

const USERNAME_HINT = 'Use 4 or more characters. Letters, numbers, and underscores only.';
const EMAIL_HINT = 'Use a unique email address that you can access.';

function validateUsername(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'Required';
  if (trimmed.length < 4) return 'Username must be at least 4 characters';
  if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) return 'Use only letters, numbers, and underscores';
  return null;
}

function validateEmail(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'Required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'Invalid email address';
  return null;
}

function getAvailabilityClassName(status: AvailabilityStatus): string {
  if (status === 'available') return 'text-emerald-600';
  if (status === 'taken' || status === 'invalid' || status === 'error') return 'text-destructive';
  return 'text-muted-foreground';
}

/* ─── Virtualized Country List ─── */
const ITEM_HEIGHT = 36;
const VISIBLE_COUNT = 6;

const VirtualizedCountryList: React.FC<{
  items: typeof countries;
  onSelect: (c: typeof countries[0]) => void;
}> = ({ items, onSelect }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const totalHeight = items.length * ITEM_HEIGHT;
  const startIdx = Math.floor(scrollTop / ITEM_HEIGHT);
  const endIdx = Math.min(startIdx + VISIBLE_COUNT + 2, items.length);
  const visibleItems = items.slice(startIdx, endIdx);
  const offsetY = startIdx * ITEM_HEIGHT;

  const handleScroll = useCallback(() => {
    if (containerRef.current) setScrollTop(containerRef.current.scrollTop);
  }, []);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="overflow-auto"
      style={{ maxHeight: VISIBLE_COUNT * ITEM_HEIGHT }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ position: 'absolute', top: offsetY, left: 0, right: 0 }}>
          {visibleItems.map(c => (
            <button
              type="button"
              key={c.code}
              className="w-full flex items-center gap-2 px-3 text-sm text-foreground hover:bg-accent transition-colors"
              style={{ height: ITEM_HEIGHT }}
              onClick={() => onSelect(c)}
            >
              <CountryFlag code={c.code} className="h-4 w-6" title={c.name} />
              <span className="truncate">{c.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const AuthPage: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const { login, register } = useAuth();
  const navigate = useNavigate();

  // Shared loading state
  const [submitting, setSubmitting] = useState(false);

  // Login state
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [showLoginPass, setShowLoginPass] = useState(false);

  // Register state
  const [regData, setRegData] = useState<RegisterData>({
    username: '', email: '', password: '', firstName: '', lastName: '',
    birthday: '', country: '', countryCode: '', avatar: null,
  });
  const [regConfirmPass, setRegConfirmPass] = useState('');
  const [regErrors, setRegErrors] = useState<Record<string, string>>({});
  const [showRegPass, setShowRegPass] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [usernameAvailability, setUsernameAvailability] = useState<AvailabilityState>({
    status: 'idle',
    message: USERNAME_HINT,
  });
  const [emailAvailability, setEmailAvailability] = useState<AvailabilityState>({
    status: 'idle',
    message: EMAIL_HINT,
  });
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showCountryDropdown) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowCountryDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showCountryDropdown]);

  const filteredCountries = countries.filter(c =>
    c.name.toLowerCase().includes(countrySearch.toLowerCase())
  );

  useEffect(() => {
    if (mode !== 'register') return;

    const username = regData.username.trim();
    const email = regData.email.trim();
    const usernameValidation = username ? validateUsername(username) : null;
    const emailValidation = email ? validateEmail(email) : null;
    const params = new URLSearchParams();
    const controller = new AbortController();

    if (!username) {
      setUsernameAvailability({ status: 'idle', message: USERNAME_HINT });
    } else if (usernameValidation) {
      setUsernameAvailability({ status: 'invalid', message: usernameValidation });
    } else {
      params.set('username', username);
      setUsernameAvailability({ status: 'checking', message: 'Checking username availability...' });
    }

    if (!email) {
      setEmailAvailability({ status: 'idle', message: EMAIL_HINT });
    } else if (emailValidation) {
      setEmailAvailability({ status: 'invalid', message: emailValidation });
    } else {
      params.set('email', email);
      setEmailAvailability({ status: 'checking', message: 'Checking email availability...' });
    }

    if (!params.toString()) {
      return () => controller.abort();
    }

    const timeoutId = window.setTimeout(() => {
      void apiFetch<AvailabilityResponse>(`/auth/availability?${params.toString()}`, {
        signal: controller.signal,
      })
        .then(result => {
          if (result.username) {
            setUsernameAvailability({
              status: result.username.available ? 'available' : 'taken',
              message: result.username.message,
            });
          }

          if (result.email) {
            setEmailAvailability({
              status: result.email.available ? 'available' : 'taken',
              message: result.email.message,
            });
          }
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return;

          if (params.has('username')) {
            setUsernameAvailability({
              status: 'error',
              message: 'Could not verify username right now',
            });
          }
          if (params.has('email')) {
            setEmailAvailability({
              status: 'error',
              message: 'Could not verify email right now',
            });
          }
        });
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [mode, regData.email, regData.username]);

  const registerBlockedByAvailability =
    usernameAvailability.status === 'checking' ||
    emailAvailability.status === 'checking' ||
    usernameAvailability.status === 'invalid' ||
    emailAvailability.status === 'invalid' ||
    usernameAvailability.status === 'taken' ||
    emailAvailability.status === 'taken' ||
    usernameAvailability.status === 'error' ||
    emailAvailability.status === 'error';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (!loginUser || !loginPass) {
      setLoginError('All fields are required');
      return;
    }
    setSubmitting(true);
    const result = await login(loginUser, loginPass);
    setSubmitting(false);
    if (result.success) {
      navigate('/dashboard');
    } else {
      setLoginError(result.error ?? 'Invalid username or password');
    }
  };

  const validateRegister = (): boolean => {
    const errors: Record<string, string> = {};
    if (!regData.firstName.trim()) errors.firstName = 'Required';
    if (!regData.lastName.trim()) errors.lastName = 'Required';
    if (!regData.username.trim()) errors.username = 'Required';
    else if (regData.username.trim().length < 4) errors.username = 'Min 4 characters';
    else if (!/^[a-zA-Z0-9_]+$/.test(regData.username.trim())) errors.username = 'Use only letters, numbers, and underscores';
    if (!regData.email.trim()) errors.email = 'Required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regData.email)) errors.email = 'Invalid email';
    if (!regData.password) errors.password = 'Required';
    else if (regData.password.length < 6) errors.password = 'Min 6 characters';
    if (regData.password !== regConfirmPass) errors.confirmPassword = 'Passwords do not match';
    if (!regData.birthday) errors.birthday = 'Required';
    if (!regData.countryCode) errors.country = 'Required';
    if (usernameAvailability.status === 'taken' || usernameAvailability.status === 'error') {
      errors.username = usernameAvailability.message;
    }
    if (emailAvailability.status === 'taken' || emailAvailability.status === 'error') {
      errors.email = emailAvailability.message;
    }
    setRegErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateRegister()) return;
    setSubmitting(true);
    const result = await register(regData);
    setSubmitting(false);
    if (result.success) {
      navigate('/dashboard');
    } else {
      const msg = result.error ?? 'Registration failed';
      if (msg.toLowerCase().includes('email')) {
        setRegErrors({ email: msg });
        setEmailAvailability({ status: 'taken', message: msg });
      } else if (msg.toLowerCase().includes('username')) {
        setRegErrors({ username: msg });
        setUsernameAvailability({ status: 'taken', message: msg });
      } else {
        setRegErrors({ username: msg });
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <Crown className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Checkers Arena
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">International Draughts</p>
        </div>

        {/* Tab Switch */}
        <div className="flex mb-6 rounded-lg bg-secondary p-1">
          {(['login', 'register'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setMode(tab)}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === tab
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab === 'login' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        <div className="surface-card p-6">
          <AnimatePresence mode="wait">
            {mode === 'login' ? (
              <motion.form
                key="login"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                onSubmit={handleLogin}
                className="space-y-4"
              >
                <div>
                  <Label htmlFor="login-user" className="text-foreground">Username</Label>
                  <Input
                    id="login-user"
                    value={loginUser}
                    onChange={e => setLoginUser(e.target.value)}
                    className="mt-1 bg-secondary border-border text-foreground"
                    placeholder="Enter username"
                  />
                </div>
                <div>
                  <Label htmlFor="login-pass" className="text-foreground">Password</Label>
                  <div className="relative mt-1">
                    <Input
                      id="login-pass"
                      type={showLoginPass ? 'text' : 'password'}
                      value={loginPass}
                      onChange={e => setLoginPass(e.target.value)}
                      className="bg-secondary border-border text-foreground pr-10"
                      placeholder="Enter password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPass(!showLoginPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showLoginPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {loginError && <p className="text-sm text-destructive">{loginError}</p>}
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? 'Signing in…' : 'Sign In'}
                </Button>
              </motion.form>
            ) : (
              <motion.form
                key="register"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onSubmit={handleRegister}
                className="space-y-4"
              >
                <ImageUpload
                  value={regData.avatar}
                  onChange={avatar => setRegData(d => ({ ...d, avatar }))}
                  username={regData.username || 'New User'}
                />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="register-first-name" className="text-foreground">First Name</Label>
                    <Input
                      id="register-first-name"
                      value={regData.firstName}
                      onChange={e => setRegData(d => ({ ...d, firstName: e.target.value }))}
                      className="mt-1 bg-secondary border-border text-foreground"
                    />
                    {regErrors.firstName && <p className="text-xs text-destructive mt-1">{regErrors.firstName}</p>}
                  </div>
                  <div>
                    <Label htmlFor="register-last-name" className="text-foreground">Last Name</Label>
                    <Input
                      id="register-last-name"
                      value={regData.lastName}
                      onChange={e => setRegData(d => ({ ...d, lastName: e.target.value }))}
                      className="mt-1 bg-secondary border-border text-foreground"
                    />
                    {regErrors.lastName && <p className="text-xs text-destructive mt-1">{regErrors.lastName}</p>}
                  </div>
                </div>

                <div>
                  <Label htmlFor="register-email" className="text-foreground">Email Address</Label>
                  <Input
                    id="register-email"
                    type="email"
                    value={regData.email}
                    onChange={e => {
                      const value = e.target.value;
                      setRegData(d => ({ ...d, email: value }));
                      setRegErrors(current => {
                        const next = { ...current };
                        delete next.email;
                        return next;
                      });
                    }}
                    className="mt-1 bg-secondary border-border text-foreground"
                    placeholder="you@example.com"
                  />
                  {regErrors.email && <p className="text-xs text-destructive mt-1">{regErrors.email}</p>}
                  <p className={`text-xs mt-1 ${getAvailabilityClassName(emailAvailability.status)}`}>{emailAvailability.message}</p>
                </div>

                <div>
                  <Label htmlFor="register-username" className="text-foreground">Username</Label>
                  <Input
                    id="register-username"
                    value={regData.username}
                    onChange={e => {
                      const value = e.target.value;
                      setRegData(d => ({ ...d, username: value }));
                      setRegErrors(current => {
                        const next = { ...current };
                        delete next.username;
                        return next;
                      });
                    }}
                    className="mt-1 bg-secondary border-border text-foreground"
                  />
                  {regErrors.username && <p className="text-xs text-destructive mt-1">{regErrors.username}</p>}
                  <p className={`text-xs mt-1 ${getAvailabilityClassName(usernameAvailability.status)}`}>{usernameAvailability.message}</p>
                </div>

                <div>
                  <Label htmlFor="register-password" className="text-foreground">Password</Label>
                  <div className="relative mt-1">
                    <Input
                      id="register-password"
                      type={showRegPass ? 'text' : 'password'}
                      value={regData.password}
                      onChange={e => setRegData(d => ({ ...d, password: e.target.value }))}
                      className="bg-secondary border-border text-foreground pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPass(!showRegPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showRegPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {regErrors.password && <p className="text-xs text-destructive mt-1">{regErrors.password}</p>}
                </div>

                <div>
                  <Label htmlFor="register-confirm-password" className="text-foreground">Confirm Password</Label>
                  <Input
                    id="register-confirm-password"
                    type="password"
                    value={regConfirmPass}
                    onChange={e => setRegConfirmPass(e.target.value)}
                    className="mt-1 bg-secondary border-border text-foreground"
                  />
                  {regErrors.confirmPassword && <p className="text-xs text-destructive mt-1">{regErrors.confirmPassword}</p>}
                </div>

                <div>
                  <Label htmlFor="register-birthday" className="text-foreground">Birthday</Label>
                  <Input
                    id="register-birthday"
                    type="date"
                    value={regData.birthday}
                    onChange={e => setRegData(d => ({ ...d, birthday: e.target.value }))}
                    className="mt-1 bg-secondary border-border text-foreground"
                  />
                  {regErrors.birthday && <p className="text-xs text-destructive mt-1">{regErrors.birthday}</p>}
                </div>

                <div className="relative" ref={dropdownRef}>
                  <Label className="text-foreground">Country</Label>
                  <div
                    className="mt-1 flex items-center gap-2 px-3 py-2 rounded-md bg-secondary border border-border cursor-pointer"
                    onClick={() => setShowCountryDropdown(!showCountryDropdown)}
                  >
                    {regData.countryCode ? (
                      <>
                        <CountryFlag code={regData.countryCode} className="h-4 w-6" title={regData.country} />
                        <span className="text-foreground text-sm flex-1">{regData.country}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground text-sm flex-1">Select country</span>
                    )}
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showCountryDropdown ? 'rotate-180' : ''}`} />
                  </div>
                  {showCountryDropdown && (
                    <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-md shadow-lg overflow-hidden">
                      <div className="p-2 border-b border-border">
                        <Input
                          placeholder="Search countries..."
                          value={countrySearch}
                          onChange={e => setCountrySearch(e.target.value)}
                          className="bg-secondary border-border text-foreground"
                          autoFocus
                        />
                      </div>
                      {filteredCountries.length === 0 ? (
                        <div className="px-3 py-4 text-sm text-muted-foreground text-center">No countries found</div>
                      ) : (
                        <VirtualizedCountryList
                          items={filteredCountries}
                          onSelect={c => {
                            setRegData(d => ({ ...d, country: c.name, countryCode: c.code }));
                            setShowCountryDropdown(false);
                            setCountrySearch('');
                          }}
                        />
                      )}
                    </div>
                  )}
                  {regErrors.country && <p className="text-xs text-destructive mt-1">{regErrors.country}</p>}
                </div>

                <Button type="submit" className="w-full" disabled={submitting || registerBlockedByAvailability}>
                  {submitting ? 'Creating account…' : registerBlockedByAvailability ? 'Resolve username/email issues' : 'Create Account'}
                </Button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

export default AuthPage;
