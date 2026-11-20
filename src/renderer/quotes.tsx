import { useEffect,useState } from 'react';
import { Heart,Plus,RefreshCw,Quote } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { active,quoteSchema } from '../shared/schema';
import { computePrayers } from '../shared/prayer';
import { addDate,dayKey,dateSpan } from '../shared/time';
import { fresh,remove,save,useSabri } from './store';
import { Button,Field,FormActions,IconButton,Modal,Panel,useNow } from './ui';
import quran from './data/quran-verses.json';
import quotes from './data/motivational-quotes.json';

export function QuoteWidget() {
  const { t } = useTranslation(),state = useSabri((store)=>store.data);
  const now=useNow(60000);
  const [source,setSource] = useState<'mixed'|'quran'|'quotes'>('mixed');
  const [offset,setOffset] = useState(0),[entry,setEntry] = useState<{ id?:string;text:string;author:string }>();
  const [favoriteOnly,setFavoriteOnly] = useState(false);
  const key=dayKey(now,state.settings.location.timezone);
  const day = +now < Date.parse(computePrayers(key,state.settings).fajr) ? addDate(key,-1):key;
  const custom=active(state.quotes);
  const stock=quran.verses.map((item)=>({ id:'quran:'+item.reference,text:item.arabic,author:item.surah+' '+item.reference,translation:item.translation,quran:true }));
  const notes=quotes.map((text,index)=>({ id:'quote:'+index,text,author:'Sabri',translation:'',quran:false })).concat(custom.map((item)=>({ ...item,translation:'',quran:false })));
  const selectedSource = source==='mixed' ? Math.floor(+now/7200000)%2===0 ? 'quran':'quotes':source;
  const pool=(favoriteOnly ? [...stock,...notes].filter((item)=>state.favorites.includes(item.id)):selectedSource==='quran' ? stock:notes);
  const index=selectedSource==='quran' ? dateSpan('2000-01-01',day):Math.floor(+now/7200000);
  const current=pool.length ? pool[((index+offset)%pool.length+pool.length)%pool.length] : undefined;
  const customCurrent=custom.find((item)=>item.id===current?.id);
  const starred=current ? state.favorites.includes(current.id):false;
  useEffect(()=>setOffset(0),[source,favoriteOnly]);
  return <Panel title={t('A moment of reflection')} icon={Quote} tone="mint" action={<div className="actions"><IconButton icon={Heart} label={t(starred?'Remove from favorites':'Favorite')} aria-pressed={starred} className={starred?'error':''} disabled={!current} onClick={()=>{ if (current) void useSabri.getState().apply({ changes:[],favorites:starred?state.favorites.filter((id)=>id!==current.id):[...state.favorites,current.id] }); }}/><IconButton icon={RefreshCw} label={t('Next')} onClick={()=>setOffset((value)=>value+1)}/></div>}>
    {current ? <><blockquote dir={current.quran?'rtl':undefined} className={current.quran?'quran-text':''}>{current.text}</blockquote>{current.translation&&<p className="muted">{current.translation}</p>}<small>{current.author}{current.quran?' · Tanzil Project (tanzil.net) · Marmaduke Pickthall':''}</small></> : <p className="muted">{t('No favorites yet')}</p>}
    <div className="toolbar"><div className="actions"><select aria-label={t('Quote source')} value={source} onChange={(e)=>setSource(e.target.value as typeof source)}><option value="mixed">{t('Mixed')}</option><option value="quran">{t('Quran')}</option><option value="quotes">{t('Quotes')}</option></select>
      <label className="check-label"><input type="checkbox" checked={favoriteOnly} onChange={(e)=>setFavoriteOnly(e.target.checked)}/>{t('Favorites')}</label></div>
      <div className="actions">{customCurrent&&<Button onClick={()=>setEntry(customCurrent)}>{t('Edit')}</Button>}<Button icon={Plus} variant="ghost" onClick={()=>setEntry({ text:'',author:'' })}>{t('Add quote')}</Button></div>
    </div>
    {entry&&<Modal title={t(entry.id?'Edit quote':'Add quote')} close={()=>setEntry(undefined)}>
      <form className="form-grid" onSubmit={async(e)=>{ e.preventDefault();const original=custom.find((item)=>item.id===entry.id);const result=quoteSchema.safeParse({ ...(original ?? fresh()),text:entry.text,author:entry.author });if (result.success&&await save('quotes',result.data)) setEntry(undefined); }}>
        <Field label={t('Quote')} wide><textarea autoFocus required maxLength={2000} rows={4} value={entry.text} onChange={(e)=>setEntry({ ...entry,text:e.target.value })}/></Field><Field label={t('Author')} wide><input maxLength={200} value={entry.author} onChange={(e)=>setEntry({ ...entry,author:e.target.value })}/></Field><FormActions close={()=>setEntry(undefined)}/>
      </form>
      {customCurrent&&entry.id===customCurrent.id&&<div className="modal-secondary"><Button variant="danger" onClick={()=>{ void remove('quotes',customCurrent);setEntry(undefined); }}>{t('Delete')}</Button></div>}
    </Modal>}
  </Panel>;
}
