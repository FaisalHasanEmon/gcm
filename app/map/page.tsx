'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import TopNav from '@/components/ui/TopNav';
import EventDrawer from '@/components/ui/EventDrawer';
import { SEV_COLOR } from '@/components/ui/Badges';
import type { ConflictEvent } from '@/lib/types';

interface Marker {
  event_id: string; event_type: string; severity: string; confidence: string;
  is_signal: boolean; headline: string; summary_20w: string;
  country_primary: string; location_name: string; damage_asset?: string;
  timestamp_utc: string; lat: number; lon: number;
}

const EVENT_TYPES = [
  'airstrike','missile_launch','drone_attack','naval_activity',
  'explosion','military_movement','infrastructure_damage','official_statement',
];
const TYPE_LABELS: Record<string, string> = {
  airstrike:'Airstrikes', missile_launch:'Missiles', drone_attack:'Drones',
  naval_activity:'Naval', explosion:'Explosions', military_movement:'Movements',
  infrastructure_damage:'Infrastructure', official_statement:'Statements',
};
const RANGE_OPTIONS = [
  { label:'6h', hours:6 }, { label:'24h', hours:24 },
  { label:'72h', hours:72 }, { label:'7d', hours:168 },
];

export default function MapPage() {
  const sp      = useSearchParams();
  const theater = sp.get('theater') ?? 'me-iran-israel-us';

  const mapRef     = useRef<HTMLDivElement>(null);
  const leafRef    = useRef<any>(null);
  const markerRefs = useRef<any[]>([]);

  const [allMarkers,    setAllMarkers]    = useState<Marker[]>([]);
  const [range,         setRange]         = useState('24h');
  const [layers,        setLayers]        = useState<Record<string,boolean>>(
    Object.fromEntries(EVENT_TYPES.map(t => [t,true]))
  );
  const [scrubberH,     setScrubberH]     = useState(24);
  const [selected,      setSelected]      = useState<ConflictEvent|null>(null);
  const [loading,       setLoading]       = useState(true);
  const [stats,         setStats]         = useState({ total:0, visible:0 });
  const [leafletReady,  setLeafletReady]  = useState(false);

  const clusterGroupRef = useRef<any>(null);

  // Load Leaflet
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ((window as any).L && (window as any).L.markerClusterGroup) { setLeafletReady(true); return; }

    // Load Leaflet CSS
    const cssId = 'leaflet-css';
    if (!document.getElementById(cssId)) {
      const link = Object.assign(document.createElement('link'), {
        id: cssId, rel: 'stylesheet',
        href: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
      });
      document.head.appendChild(link);
    }

    // Load MarkerCluster CSS
    const clusterCssId = 'leaflet-cluster-css';
    if (!document.getElementById(clusterCssId)) {
      const link = Object.assign(document.createElement('link'), {
        id: clusterCssId, rel: 'stylesheet',
        href: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.Default.min.css',
      });
      document.head.appendChild(link);
    }

    // Load Leaflet JS, then MarkerCluster JS (depends on Leaflet)
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    script.onload = () => {
      const clusterScript = document.createElement('script');
      clusterScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.min.js';
      clusterScript.onload = () => setLeafletReady(true);
      document.head.appendChild(clusterScript);
    };
    document.head.appendChild(script);
  }, []);

  // Init map
  useEffect(() => {
    if (!leafletReady || !mapRef.current || leafRef.current) return;
    const L = (window as any).L;
    const map = L.map(mapRef.current, { center:[32,44], zoom:5, preferCanvas:true });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution:'© OpenStreetMap © CARTO', maxZoom:19,
    }).addTo(map);
    leafRef.current = map;
  }, [leafletReady]);

  // Fetch markers
  useEffect(() => {
    setLoading(true);
    fetch(`/api/map/events?theater=${theater}&range=${range}&include_signals=true`)
      .then(r => r.json())
      .then(j => {
        setAllMarkers(j.markers ?? []);
        const h = RANGE_OPTIONS.find(r => r.label===range)?.hours ?? 24;
        setScrubberH(h);
      })
      .finally(() => setLoading(false));
  }, [theater, range]);

  // Render markers into a MarkerClusterGroup
  const renderMarkers = useCallback(() => {
    const L   = (window as any).L;
    const map = leafRef.current;
    if (!L || !map) return;

    // Remove previous cluster group and all its markers
    if (clusterGroupRef.current) {
      map.removeLayer(clusterGroupRef.current);
    }
    markerRefs.current = [];

    const cutoff = new Date(Date.now() - scrubberH*3_600_000);
    const visible = allMarkers.filter(m =>
      layers[m.event_type] !== false &&
      m.lat != null && m.lon != null &&
      (!m.timestamp_utc || new Date(m.timestamp_utc) >= cutoff)
    );
    setStats({ total:allMarkers.length, visible:visible.length });

    // Create a new cluster group — max zoom before clustering disengages
    const clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 60,
      disableClusteringAtZoom: 10,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
    });
    clusterGroupRef.current = clusterGroup;

    visible.forEach(m => {
      const color = SEV_COLOR[m.severity] ?? '#94a3b8';
      const sz    = m.severity==='critical'?16:m.severity==='high'?13:10;
      const dash  = m.is_signal ? 'border-style:dashed;opacity:.7;' : '';
      const ring  = m.severity==='critical'
        ? `<div style="position:absolute;inset:-5px;border-radius:50%;border:2px solid ${color};opacity:.4;animation:ringPulse 2s infinite"></div>` : '';
      const icon = L.divIcon({
        html:`<div style="position:relative;width:${sz}px;height:${sz}px">${ring}<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,.8);box-shadow:0 0 8px ${color}88;${dash}"></div></div>`,
        iconSize:[sz,sz], iconAnchor:[sz/2,sz/2], className:'',
      });
      const time = m.timestamp_utc ? new Date(m.timestamp_utc).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'UTC'})+' UTC' : '';
      const marker = L.marker([m.lat,m.lon],{icon});
      marker.bindPopup(`
        <div style="min-width:240px;font-family:system-ui;font-size:13px;padding:2px">
          <div style="font-weight:700;margin-bottom:5px;line-height:1.4">${m.headline??m.summary_20w}</div>
          <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:4px">
            <span style="background:${color};color:#fff;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:700;text-transform:uppercase">${m.severity}</span>
            <span style="background:#f1f5f9;color:#475569;padding:1px 6px;border-radius:3px;font-size:10px">${m.confidence}</span>
            ${m.is_signal?'<span style="background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:3px;font-size:10px">SIGNAL</span>':''}
          </div>
          <div style="color:#64748b;font-size:11px">${m.country_primary}${m.location_name?' · '+m.location_name:''} · ${time}</div>
          ${m.damage_asset?`<div style="margin-top:4px;color:#92400e;font-size:11px">⚠ ${m.damage_asset}</div>`:''}
        </div>
      `, {maxWidth:280});
      marker.on('click', () => setSelected(m as unknown as ConflictEvent));
      clusterGroup.addLayer(marker);
      markerRefs.current.push(marker);
    });
  }, [allMarkers, layers, scrubberH]);

  useEffect(() => { renderMarkers(); }, [renderMarkers]);

  const toggleLayer = (t:string) => setLayers(l => ({...l,[t]:!l[t]}));
  const setAll = (on:boolean) => setLayers(Object.fromEntries(EVENT_TYPES.map(t=>[t,on])));
  const rangeH = RANGE_OPTIONS.find(r=>r.label===range)?.hours??24;

  return (
    <div style={{minHeight:'100vh',background:'#0f172a',display:'flex',flexDirection:'column'}}>
      <TopNav/>
      <div style={{display:'flex',flex:1,overflow:'hidden'}}>

        {/* Sidebar */}
        <aside style={{width:'230px',flexShrink:0,background:'rgba(15,23,42,.97)',borderRight:'1px solid rgba(255,255,255,.07)',overflowY:'auto',padding:'16px',display:'flex',flexDirection:'column',gap:'18px'}}>
          <div>
            <Lbl>Theater</Lbl>
            <div style={{color:'#f8fafc',fontSize:'13px',fontWeight:600}}>
              {theater==='me-iran-israel-us'?'Middle East':'Eastern Europe'}
            </div>
          </div>
          <div>
            <Lbl>Events</Lbl>
            <div style={{display:'flex',gap:'12px'}}>
              <Stat label="Total"   v={stats.total}/>
              <Stat label="Visible" v={stats.visible} color="#3b82f6"/>
            </div>
          </div>
          <div>
            <Lbl>Range</Lbl>
            <div style={{display:'flex',gap:'4px',flexWrap:'wrap'}}>
              {RANGE_OPTIONS.map(r=>(
                <button key={r.label} onClick={()=>setRange(r.label)} style={{padding:'4px 9px',borderRadius:'5px',border:'none',fontSize:'12px',fontWeight:600,cursor:'pointer',background:range===r.label?'#3b82f6':'rgba(255,255,255,.08)',color:range===r.label?'#fff':'rgba(255,255,255,.5)',fontFamily:'var(--font-sans)'}}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}>
              <Lbl>Layers</Lbl>
              <div style={{display:'flex',gap:'4px'}}>
                <Tbtn onClick={()=>setAll(true)}>All</Tbtn>
                <span style={{color:'rgba(255,255,255,.2)'}}>·</span>
                <Tbtn onClick={()=>setAll(false)}>None</Tbtn>
              </div>
            </div>
            {EVENT_TYPES.map(type=>(
              <label key={type} style={{display:'flex',alignItems:'center',gap:'7px',marginBottom:'7px',cursor:'pointer',userSelect:'none'}}>
                <input type="checkbox" checked={layers[type]} onChange={()=>toggleLayer(type)} style={{cursor:'pointer',accentColor:'#3b82f6'}}/>
                <span style={{fontSize:'12.5px',color:layers[type]?'rgba(255,255,255,.8)':'rgba(255,255,255,.28)',transition:'color .15s'}}>
                  {TYPE_LABELS[type]??type}
                </span>
              </label>
            ))}
          </div>
          <div>
            <Lbl>Severity</Lbl>
            {(['critical','high','medium','low'] as const).map(s=>(
              <div key={s} style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'6px'}}>
                <div style={{width:s==='critical'?14:s==='high'?11:9,height:s==='critical'?14:s==='high'?11:9,borderRadius:'50%',background:SEV_COLOR[s],boxShadow:`0 0 6px ${SEV_COLOR[s]}66`,flexShrink:0}}/>
                <span style={{fontSize:'12px',color:'rgba(255,255,255,.5)',textTransform:'capitalize'}}>{s}</span>
              </div>
            ))}
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <div style={{width:9,height:9,borderRadius:'50%',border:'2px dashed rgba(255,255,255,.3)',flexShrink:0}}/>
              <span style={{fontSize:'11px',color:'rgba(255,255,255,.3)'}}>Signal</span>
            </div>
          </div>
        </aside>

        {/* Map column */}
        <div style={{flex:1,display:'flex',flexDirection:'column',position:'relative'}}>
          {/* Time scrubber */}
          <div style={{background:'rgba(15,23,42,.92)',backdropFilter:'blur(8px)',borderBottom:'1px solid rgba(255,255,255,.07)',padding:'9px 20px',display:'flex',alignItems:'center',gap:'14px'}}>
            <span style={{color:'rgba(255,255,255,.4)',fontSize:'11px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.08em',whiteSpace:'nowrap'}}>Time Scrubber</span>
            <input type="range" min={1} max={rangeH} step={1} value={scrubberH}
              onChange={e=>setScrubberH(parseInt(e.target.value))}
              style={{flex:1,accentColor:'#3b82f6',cursor:'pointer'}}/>
            <span style={{color:'#3b82f6',fontSize:'13px',fontWeight:700,fontFamily:'var(--font-mono)',whiteSpace:'nowrap',minWidth:'64px'}}>
              Last {scrubberH}h
            </span>
            <span style={{color:'rgba(255,255,255,.3)',fontSize:'11px',whiteSpace:'nowrap'}}>{stats.visible} shown</span>
          </div>

          {loading && (
            <div style={{position:'absolute',inset:0,background:'rgba(15,23,42,.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:500}}>
              <div style={{color:'rgba(255,255,255,.8)',fontSize:'14px'}}>Loading events…</div>
            </div>
          )}

          <div ref={mapRef} style={{flex:1,minHeight:'500px'}}/>

          <style>{`
            @keyframes ringPulse{0%,100%{transform:scale(1);opacity:.4}50%{transform:scale(1.5);opacity:.1}}
          `}</style>
        </div>
      </div>
      <EventDrawer event={selected} onClose={()=>setSelected(null)}/>
    </div>
  );
}

function Lbl({children}:{children:React.ReactNode}) {
  return <div style={{color:'rgba(255,255,255,.35)',fontSize:'10px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.1em',marginBottom:'7px'}}>{children}</div>;
}
function Stat({label,v,color}:{label:string;v:number;color?:string}) {
  return <div style={{textAlign:'center'}}><div style={{fontFamily:'var(--font-mono)',fontSize:'20px',fontWeight:800,color:color??'#f8fafc'}}>{v}</div><div style={{fontSize:'10px',color:'rgba(255,255,255,.3)',textTransform:'uppercase'}}>{label}</div></div>;
}
function Tbtn({children,onClick}:{children:React.ReactNode;onClick:()=>void}) {
  return <button onClick={onClick} style={{background:'none',border:'none',color:'#3b82f6',fontSize:'11px',fontWeight:600,cursor:'pointer',padding:'0',fontFamily:'var(--font-sans)'}}>{children}</button>;
}
