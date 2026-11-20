import { Goal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { studyStats } from '../shared/academic';
import { dayKey } from '../shared/time';
import { useSabri } from './store';
import { Panel,useNow } from './ui';
export function GoalSummary() {
  const { t } = useTranslation(),state = useSabri((s) => s.data);
  const today = dayKey(useNow(60000),state.settings.location.timezone);
  const { totalMinutes } = studyStats(state,today,1),goal = state.settings.focus.dailyGoal;
  return <Panel title={t('Study goal')} icon={Goal} tone="mint"><div className="metric">{Math.round(totalMinutes)} <span>/ {goal} {t('min')}</span></div><progress value={Math.min(goal,totalMinutes)} max={goal} className="full-width"/></Panel>;
}
