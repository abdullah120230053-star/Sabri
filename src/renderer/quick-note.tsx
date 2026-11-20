import { Plus,StickyNote } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button,Panel } from './ui';
export function QuickNote() {
  const { t } = useTranslation(),go = useNavigate();
  return <Panel title={t('Quick note')} icon={StickyNote} action={<Button variant="ghost" icon={Plus} onClick={()=>go('/notes?new=1')}>{t('New note')}</Button>}/>;
}
