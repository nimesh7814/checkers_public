import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { ACHIEVEMENTS, getUnlockedAchievements } from '@/lib/achievements';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Award, Lock } from 'lucide-react';

const categoryLabels: Record<string, string> = {
  milestone: 'Milestones',
  streak: 'Streaks',
  skill: 'Skill',
  dedication: 'Dedication',
};

const categoryOrder = ['milestone', 'streak', 'skill', 'dedication'];

const AchievementsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const unlocked = useMemo(() => (user ? getUnlockedAchievements(user.id) : []), [user?.id]);
  const progress = `${unlocked.length}/${ACHIEVEMENTS.length}`;

  const grouped = useMemo(() => {
    const map: Record<string, typeof ACHIEVEMENTS> = {};
    for (const a of ACHIEVEMENTS) {
      if (!map[a.category]) map[a.category] = [];
      map[a.category].push(a);
    }
    return map;
  }, []);

  if (!user) { navigate('/'); return null; }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Award className="w-5 h-5 text-primary" />
        <h1 className="font-semibold text-foreground">Achievements</h1>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">{progress} unlocked</span>
      </header>

      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Progress bar */}
        <div className="surface-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">Overall Progress</span>
            <span className="text-sm font-bold text-primary tabular-nums">{Math.round((unlocked.length / ACHIEVEMENTS.length) * 100)}%</span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(unlocked.length / ACHIEVEMENTS.length) * 100}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="h-full bg-primary rounded-full"
            />
          </div>
        </div>

        {/* Categories */}
        {categoryOrder.map(cat => {
          const items = grouped[cat];
          if (!items) return null;
          return (
            <div key={cat}>
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                {categoryLabels[cat]}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {items.map((achievement, i) => {
                  const isUnlocked = unlocked.includes(achievement.id);
                  return (
                    <motion.div
                      key={achievement.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className={`surface-card p-4 flex items-start gap-3 border transition-colors ${
                        isUnlocked
                          ? 'border-primary/20 bg-primary/5'
                          : 'border-transparent opacity-60'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl ${
                        isUnlocked ? 'bg-primary/15' : 'bg-secondary'
                      }`}>
                        {isUnlocked ? achievement.icon : <Lock className="w-4 h-4 text-muted-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-semibold ${isUnlocked ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {achievement.name}
                          </span>
                          {isUnlocked && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium">✓</span>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{achievement.description}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AchievementsPage;
