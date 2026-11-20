import { useEffect, useId, useRef, useState, type ReactNode, type ButtonHTMLAttributes, type CSSProperties } from 'react';
import { Check, ChevronLeft, ChevronRight, X, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSabri } from './store';

export function Button({ children, variant = 'secondary', icon: Icon, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; icon?: LucideIcon }) {
  return <button type="button" className={'button button-' + variant + ' ' + className} {...props}>{Icon && <Icon size={17} aria-hidden="true" />}{children}</button>;
}
export function IconButton({ label, icon: Icon, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: LucideIcon }) {
  return <button type="button" className={'icon-button ' + className} aria-label={label} title={label} {...props}><Icon size={18} aria-hidden="true" /></button>;
}
export function Panel({ title, icon: Icon, tone = 'lilac', action, children, className = '', ...props }: { title: string; icon?: LucideIcon; tone?: string; action?: ReactNode; children: ReactNode; className?: string; style?: CSSProperties }) {
  return <section className={'panel ' + className} {...props}><div className="panel-head"><div className="panel-label">{Icon && <span className={'tile tile-' + tone}><Icon size={17}/></span>}<h2>{title}</h2></div>{action}</div>{children}</section>;
}
export function PageHead({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="page-head"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="actions">{action}</div>}</div>;
}
export function Empty({ icon: Icon, title, detail, action, compact = false }: { icon: LucideIcon; title: string; detail?: string; action?: ReactNode; compact?: boolean }) {
  return <div className={'empty' + (compact ? ' compact' : '')}><span className="empty-icon"><Icon size={23}/></span><strong>{title}</strong>{detail && <p>{detail}</p>}{action}</div>;
}
export function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={wide ? 'field wide' : 'field'}><span>{label}</span>{children}</label>;
}
export function Modal({ title, children, close, wide = false }: { title: string; children: ReactNode; close(): void; wide?: boolean }) {
  const { t } = useTranslation();
  const heading = useId();
  const element = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = element.current;
    dialog?.showModal();
    return () => { dialog?.close(); };
  }, []);
  return <dialog ref={element} className={wide ? 'modal modal-wide' : 'modal'} aria-labelledby={heading} onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div className="modal-body"><div className="modal-head"><h2 id={heading}>{title}</h2><IconButton icon={X} label={t('Close')} onClick={close}/></div>{children}</div>
  </dialog>;
}
export function FormActions({ close, label }: { close(): void; label?: string }) {
  const { t } = useTranslation();
  return <div className="form-actions"><Button onClick={close}>{t('Cancel')}</Button><Button type="submit" variant="primary">{label ?? t('Save')}</Button></div>;
}
export function Segments<T extends string>({ options, value, onChange, label }: { options: readonly { value: T; label: string }[]; value: T; onChange(value: T): void; label: string }) {
  return <div className="segments" role="group" aria-label={label}>{options.map((item) => <button key={item.value} type="button" aria-pressed={item.value === value} onClick={() => onChange(item.value)}>{item.label}</button>)}</div>;
}
export function Pager({ back, forward, children }: { back(): void; forward(): void; children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const rtl = i18n.dir() === 'rtl';
  return <div className="pager"><IconButton icon={rtl ? ChevronRight : ChevronLeft} label={t('Previous')} onClick={back}/><strong>{children}</strong><IconButton icon={rtl ? ChevronLeft : ChevronRight} label={t('Next')} onClick={forward}/></div>;
}
export function Toast() {
  const { t } = useTranslation();
  const toast = useSabri((store) => store.toast);
  const dismiss = useSabri((store) => store.dismiss);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(dismiss, toast.undo ? 10000 : 5500);
    return () => clearTimeout(id);
  }, [toast, dismiss]);
  if (!toast) return null;
  return <div className="toast" role="status"><Check size={18}/><span>{toast.message}</span>{toast.undo && <Button onClick={() => { toast.undo?.(); dismiss(); }}>{t('Undo')}</Button>}<IconButton label={t('Close')} icon={X} onClick={dismiss}/></div>;
}
export function useNow(milliseconds = 1000) {
  const [now, change] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => change(new Date()), milliseconds); return () => clearInterval(timer); }, [milliseconds]);
  return now;
}
export const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).replaceAll('_', ' ');
export const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

