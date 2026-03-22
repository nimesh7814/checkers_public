import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import ImageUpload from '@/components/ImageUpload';
import { countries } from '@/data/countries';
import { BoardTheme, PieceColor } from '@/types/game';
import { ArrowLeft, Save, Sun, Moon, User, Palette } from 'lucide-react';
import { setSoundEnabled as applySoundPreference } from '@/lib/sounds';

function normalizeDateForInput(value?: string | null): string {
  if (!value) return '';
  return value.slice(0, 10);
}

function resolveCountryCode(countryCode?: string, countryName?: string): string {
  if (countryCode?.trim()) return countryCode;
  if (!countryName?.trim()) return '';
  const found = countries.find(c => c.name.toLowerCase() === countryName.toLowerCase());
  return found?.code ?? '';
}

const SettingsPage: React.FC = () => {
  const { user, updateProfile } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  const [avatar, setAvatar] = useState(user?.avatar ?? null);
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [birthday, setBirthday] = useState(normalizeDateForInput(user?.birthday));
  const [country, setCountry] = useState(user?.country ?? '');
  const [countryCode, setCountryCode] = useState(resolveCountryCode(user?.countryCode, user?.country));
  const [boardTheme, setBoardTheme] = useState<BoardTheme>(user?.preferences.boardTheme ?? 'classic');
  const [checkerColor, setCheckerColor] = useState<PieceColor>(user?.preferences.checkerColor ?? 'white');
  const [soundEnabled, setSoundEnabled] = useState(user?.preferences.soundEnabled ?? true);
  const [animationsEnabled, setAnimationsEnabled] = useState(user?.preferences.animationsEnabled ?? true);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const isMountedRef = useRef(true);

  if (!user) { navigate('/'); return null; }

  useEffect(() => {
    setAvatar(user.avatar ?? null);
    setFirstName(user.firstName ?? '');
    setLastName(user.lastName ?? '');
    setEmail(user.email ?? '');
    setBirthday(normalizeDateForInput(user.birthday));
    setCountry(user.country ?? '');
    setCountryCode(resolveCountryCode(user.countryCode, user.country));
    setBoardTheme(user.preferences.boardTheme ?? 'classic');
    setCheckerColor(user.preferences.checkerColor ?? 'white');
    setSoundEnabled(user.preferences.soundEnabled ?? true);
    setAnimationsEnabled(user.preferences.animationsEnabled ?? true);
  }, [user]);

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = countries.find(c => c.code === e.target.value);
    if (selected) {
      setCountry(selected.name);
      setCountryCode(selected.code);
    }
  };

  const handleSoundToggle = (enabled: boolean) => {
    setSoundEnabled(enabled);
    applySoundPreference(enabled);
  };

  const handleSave = async () => {
    setSaved(false);
    setSaving(true);
    try {
      await updateProfile({
        avatar,
        firstName,
        lastName,
        email,
        birthday,
        country,
        countryCode,
        preferences: { boardTheme, checkerColor, soundEnabled, animationsEnabled },
      });
      if (!isMountedRef.current) return;
      setSaved(true);
      setSaving(false);

      await new Promise(resolve => window.setTimeout(resolve, 1500));
      if (!isMountedRef.current) return;
      navigate('/dashboard');
    } finally {
      if (isMountedRef.current) {
        setSaving(false);
      }
    }
  };

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="font-semibold text-foreground">Profile Settings</h1>
      </header>

      <div className="max-w-lg mx-auto p-6 space-y-8">
        {/* Profile */}
        <section className="space-y-4">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <User className="w-3.5 h-3.5" /> Profile
          </h2>
          <ImageUpload value={avatar} onChange={setAvatar} username={user.username} />

          {/* Username - display only */}
          <div>
            <Label className="text-foreground">Username</Label>
            <div className="mt-1 px-3 py-2 rounded-md bg-muted border border-border text-muted-foreground text-sm cursor-not-allowed">
              {user.username}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Username cannot be changed</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-foreground">First Name</Label>
              <Input value={firstName} onChange={e => setFirstName(e.target.value)} className="mt-1 bg-secondary border-border text-foreground" />
            </div>
            <div>
              <Label className="text-foreground">Last Name</Label>
              <Input value={lastName} onChange={e => setLastName(e.target.value)} className="mt-1 bg-secondary border-border text-foreground" />
            </div>
          </div>

          <div>
            <Label className="text-foreground">Email</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1 bg-secondary border-border text-foreground" />
          </div>

          <div>
            <Label className="text-foreground">Birthday</Label>
            <Input type="date" value={birthday} onChange={e => setBirthday(e.target.value)} className="mt-1 bg-secondary border-border text-foreground" />
          </div>

          <div>
            <Label className="text-foreground">Country</Label>
            <select
              value={countryCode}
              onChange={handleCountryChange}
              className="mt-1 w-full px-3 py-2 rounded-md bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select a country</option>
              {countries.map(c => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.name}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* Theme */}
        <section className="space-y-4">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5" /> Appearance
          </h2>

          <div>
            <Label className="text-foreground">Theme</Label>
            <div className="flex gap-2 mt-1">
              {([
                { id: 'light' as const, label: 'Light', icon: Sun },
                { id: 'dark' as const, label: 'Dark', icon: Moon },
              ]).map(t => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`flex-1 py-2.5 px-3 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                    theme === t.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground hover:bg-accent'
                  }`}
                >
                  <t.icon className="w-4 h-4" />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-foreground">Default Board Theme</Label>
            <div className="flex gap-2 mt-1">
              {(['classic', 'wooden', 'metal'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setBoardTheme(t)}
                  className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                    boardTheme === t ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-accent'
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-foreground">Preferred Color</Label>
            <div className="flex gap-2 mt-1">
              {(['white', 'black'] as const).map(c => (
                <button
                  key={c}
                  onClick={() => setCheckerColor(c)}
                  className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                    checkerColor === c ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-accent'
                  }`}
                >
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-foreground">Sound Effects</Label>
            <Switch checked={soundEnabled} onCheckedChange={handleSoundToggle} />
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-foreground">Animations</Label>
            <Switch checked={animationsEnabled} onCheckedChange={setAnimationsEnabled} />
          </div>
        </section>

        <Button onClick={handleSave} className="w-full" disabled={saving}>
          <Save className="w-4 h-4 mr-2" /> {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
};

export default SettingsPage;
