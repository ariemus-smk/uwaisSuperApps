import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import axios from 'axios';
import { MapPin, Radio, CheckCircle, AlertTriangle, Crosshair, ZoomIn, RefreshCw } from 'lucide-react';

const CustomMap = ({ 
  onLocationSelect, 
  onPortSelect,
  selectedOdp,
  markerPosition = { lat: -0.0263, lng: 109.3425 }, // Kalimantan Barat (Pontianak)
  interactive = true,
  searchCoords
}) => {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const targetMarkerRef = useRef(null);
  const coverageCircleRef = useRef(null);
  const markersLayerRef = useRef(L.layerGroup());
  const linesLayerRef = useRef(L.layerGroup());
  
  // Real database-backed list of OLTs and ODPs
  const [olts, setOlts] = useState([]);
  const [odps, setOdps] = useState([]);
  const [loading, setLoading] = useState(false);

  // Core OLT position (Pontianak center office)
  const oltCenter = { lat: -0.0263, lng: 109.3425, name: 'OLT PONTIANAK CENTRAL' };

  // React state elements for dynamic details card
  const [targetPos, setTargetPos] = useState(markerPosition);
  const [coverageStatus, setCoverageStatus] = useState('unchecked');
  const [nearestOdp, setNearestOdp] = useState(null);
  const [selectedPort, setSelectedPort] = useState(null);
  const [activeOdp, setActiveOdp] = useState(null);

  // Fetch real infrastructure data from API
  const fetchInfrastructure = async () => {
    setLoading(true);
    try {
      const [oltsRes, odpsRes] = await Promise.all([
        axios.get('/api/infrastructure/olts'),
        axios.get('/api/infrastructure/odps')
      ]);

      if (oltsRes.data && oltsRes.data.status === 'success') {
        setOlts(oltsRes.data.data || []);
      }
      if (odpsRes.data && odpsRes.data.status === 'success') {
        setOdps(odpsRes.data.data || []);
      }
    } catch (err) {
      console.error('Failed to load real infrastructure data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Sync / initialize infrastructure data on load
  useEffect(() => {
    fetchInfrastructure();
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Remove old map instance if it already exists
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    // Create the map centered at targetPos
    const map = L.map(mapContainerRef.current, {
      center: [targetPos.lat, targetPos.lng],
      zoom: 14,
      zoomControl: true,
      attributionControl: false
    });

    mapInstanceRef.current = map;

    // Load CartoDB Dark Matter tile layer (Premium thematic dark mode)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 20
    }).addTo(map);

    // Initialize layers
    markersLayerRef.current.addTo(map);
    linesLayerRef.current.addTo(map);

    // ADD TARGET PIN & COVERAGE CIRCLE
    if (interactive) {
      // Target Select Pin Icon (Emerald Green Bouncing Marker)
      const targetIcon = L.divIcon({
        html: `
          <div class="flex flex-col items-center justify-center animate-bounce">
            <svg class="h-7 w-7 text-emerald-400 filter drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
          </div>
        `,
        className: 'custom-target-icon',
        iconSize: [28, 28],
        iconAnchor: [14, 28]
      });

      const targetMarker = L.marker([targetPos.lat, targetPos.lng], { icon: targetIcon, draggable: false }).addTo(map);
      targetMarkerRef.current = targetMarker;

      // Add Coverage Circle (500 meter radius)
      const coverageCircle = L.circle([targetPos.lat, targetPos.lng], {
        radius: 500, // 500 meters
        color: '#10b981',
        fillColor: '#10b981',
        fillOpacity: 0.05,
        weight: 1,
        dashArray: '3, 3'
      }).addTo(map);
      coverageCircleRef.current = coverageCircle;

      // Click on Map trigger to evaluate server-side coverage
      map.on('click', async (e) => {
        const { lat, lng } = e.latlng;
        const fixedLat = parseFloat(lat.toFixed(6));
        const fixedLng = parseFloat(lng.toFixed(6));
        setTargetPos({ lat: fixedLat, lng: fixedLng });

        // Move visual marker and circle to clicked coordinates
        if (targetMarkerRef.current) {
          targetMarkerRef.current.setLatLng([lat, lng]);
        }
        if (coverageCircleRef.current) {
          coverageCircleRef.current.setLatLng([lat, lng]);
        }

        // Parent callback
        if (onLocationSelect) {
          onLocationSelect({ lat: fixedLat, lng: fixedLng });
        }

        // Call server-side coverage evaluation (Haversine precision matching DB ODP records)
        try {
          const response = await axios.get(`/api/infrastructure/coverage?latitude=${fixedLat}&longitude=${fixedLng}`);
          if (response.data && response.data.status === 'success') {
            const covResult = response.data.data;
            const nearest = covResult.odps && covResult.odps[0] ? covResult.odps[0] : null;

            setNearestOdp(nearest);
            setActiveOdp(nearest);
            setSelectedPort(null);

            if (covResult.covered && nearest) {
              setCoverageStatus('covered');
              if (coverageCircleRef.current) {
                coverageCircleRef.current.setStyle({ color: '#10b981', fillColor: '#10b981' });
              }
            } else {
              setCoverageStatus('uncovered');
              if (coverageCircleRef.current) {
                coverageCircleRef.current.setStyle({ color: '#f43f5e', fillColor: '#f43f5e' });
              }
            }
          }
        } catch (err) {
          console.error('Failed to query server-side coverage:', err);
        }
      });
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update map layer markers whenever database's olts or odps are fetched/changed
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    // Clear old layers
    markersLayerRef.current.clearLayers();
    linesLayerRef.current.clearLayers();

    // 1. ADD OLT CORE MARKERS
    olts.forEach(olt => {
      const oltIcon = L.divIcon({
        html: `
          <div class="flex flex-col items-center justify-center relative">
            <div class="h-4 w-4 bg-violet-500 rounded-full border-2 border-white animate-ping absolute opacity-40"></div>
            <div class="h-8 w-8 bg-violet-600/20 border border-violet-500 rounded-xl flex items-center justify-center text-violet-400 shadow-lg shadow-violet-500/20">
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
              </svg>
            </div>
            <span class="text-[8px] font-bold bg-slate-950 border border-slate-800 text-brand-300 px-1 rounded mt-0.5 whitespace-nowrap z-50">${olt.name}</span>
          </div>
        `,
        className: 'custom-olt-icon',
        iconSize: [32, 45],
        iconAnchor: [16, 22]
      });

      L.marker([oltCenter.lat, oltCenter.lng], { icon: oltIcon }).addTo(markersLayerRef.current);
    });

    // 2. ADD REAL DB ODP MARKERS & FIBER CABLING POLYLINES
    odps.forEach(odp => {
      if (!odp.latitude || !odp.longitude) return;

      // Draw fiber link from Central OLT to ODP box
      L.polyline([[oltCenter.lat, oltCenter.lng], [odp.latitude, odp.longitude]], {
        color: '#8b5cf6',
        weight: 1.5,
        dashArray: '5, 5',
        opacity: 0.4
      }).addTo(linesLayerRef.current);

      // Custom status color representing free ports availability
      const used = odp.used_ports || 0;
      const total = odp.total_ports || 8;
      const isFull = used >= total;

      const odpIcon = L.divIcon({
        html: `
          <div class="flex flex-col items-center justify-center relative">
            <div class="h-5 w-5 bg-slate-900 border-2 ${isFull ? 'border-rose-500' : 'border-indigo-500'} rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-110">
              <div class="h-1.5 w-1.5 rounded-full ${isFull ? 'bg-rose-400' : 'bg-indigo-400'}"></div>
            </div>
            <span class="text-[8px] font-bold bg-slate-950 border border-slate-850 text-slate-400 px-1 rounded mt-0.5 whitespace-nowrap">${odp.name} (${used}/${total})</span>
          </div>
        `,
        className: 'custom-odp-icon',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });

      const marker = L.marker([odp.latitude, odp.longitude], { icon: odpIcon }).addTo(markersLayerRef.current);
      
      marker.on('click', () => {
        setActiveOdp(odp);
        setSelectedPort(null);
      });
    });

    // Auto select first ODP as default active
    if (odps.length > 0 && !activeOdp) {
      setActiveOdp(odps[0]);
    }
  }, [olts, odps]);

  // Sync searched / queried coordinates (CRM / Registration form)
  useEffect(() => {
    if (searchCoords && mapInstanceRef.current) {
      const latLng = [searchCoords.lat, searchCoords.lng];
      mapInstanceRef.current.setView(latLng, 15);
      setTargetPos(searchCoords);

      // Update marker and circle positions
      if (targetMarkerRef.current) {
        targetMarkerRef.current.setLatLng(latLng);
      }
      if (coverageCircleRef.current) {
        coverageCircleRef.current.setLatLng(latLng);
      }

      // Check coverage trigger via server
      const triggerCoverageQuery = async () => {
        try {
          const response = await axios.get(`/api/infrastructure/coverage?latitude=${searchCoords.lat}&longitude=${searchCoords.lng}`);
          if (response.data && response.data.status === 'success') {
            const covResult = response.data.data;
            const nearest = covResult.odps && covResult.odps[0] ? covResult.odps[0] : null;

            setNearestOdp(nearest);
            setActiveOdp(nearest);
            setSelectedPort(null);

            if (covResult.covered && nearest) {
              setCoverageStatus('covered');
              if (coverageCircleRef.current) {
                coverageCircleRef.current.setStyle({ color: '#10b981', fillColor: '#10b981' });
              }
            } else {
              setCoverageStatus('uncovered');
              if (coverageCircleRef.current) {
                coverageCircleRef.current.setStyle({ color: '#f43f5e', fillColor: '#f43f5e' });
              }
            }
          }
        } catch (err) {
          console.error(err);
        }
      };

      triggerCoverageQuery();
    }
  }, [searchCoords]);

  const handlePortClick = (portNum, odp) => {
    // Basic validation
    const used = odp.used_ports || 0;
    const total = odp.total_ports || 8;
    
    setSelectedPort(portNum);
    if (onPortSelect) {
      onPortSelect(portNum, odp);
    }
  };

  return (
    <div className="space-y-4">
      {/* Real Leaflet Map Container */}
      <div className="relative">
        <div 
          ref={mapContainerRef} 
          className="w-full h-[350px] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl relative z-10"
          style={{ background: '#0b1329' }}
        />
        {loading && (
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px] flex items-center justify-center z-50 rounded-2xl">
            <RefreshCw className="h-8 w-8 text-brand-400 animate-spin" />
          </div>
        )}
      </div>

      {/* Coverage details or Port Selector */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Coverage Status Info Card */}
        <div className="glass-panel p-4 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Status Jangkauan Jaringan (Real)</h3>
            <div className="flex items-center space-x-3 mb-3">
              {coverageStatus === 'unchecked' && (
                <>
                  <div className="p-2 bg-slate-800 rounded-xl text-slate-400"><ZoomIn className="h-5 w-5" /></div>
                  <div>
                    <span className="text-sm font-bold text-slate-300 block">Belum Diperiksa</span>
                    <span className="text-xs text-slate-500 block">Klik di mana saja pada peta untuk cek jangkauan optik</span>
                  </div>
                </>
              )}
              {coverageStatus === 'covered' && (
                <>
                  <div className="p-2 bg-emerald-500/15 rounded-xl text-emerald-400"><CheckCircle className="h-5 w-5" /></div>
                  <div>
                    <span className="text-sm font-bold text-emerald-400 block">Sinyal Layak & Feasible</span>
                    <span className="text-xs text-slate-400 block">Koordinat terpilih berada dalam jangkauan &lt; 500m dari {nearestOdp?.name}</span>
                  </div>
                </>
              )}
              {coverageStatus === 'uncovered' && (
                <>
                  <div className="p-2 bg-rose-500/15 rounded-xl text-rose-400"><AlertTriangle className="h-5 w-5" /></div>
                  <div>
                    <span className="text-sm font-bold text-rose-400 block">Di Luar Jangkauan</span>
                    <span className="text-xs text-slate-400 block">Kotak splitter terdekat berada di luar batas instalasi (500 meter)</span>
                  </div>
                </>
              )}
            </div>
          </div>
          {nearestOdp && (
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 text-xs space-y-1">
              <span className="text-slate-400 block"><strong className="text-slate-300">ODP Terdekat:</strong> {nearestOdp.name}</span>
              <span className="text-slate-400 block">
                <strong className="text-slate-300">Jarak Spasial:</strong> {nearestOdp.distance_meters || Math.round(nearestOdp.distance_meters) || '0'} meter
              </span>
              <span className="text-slate-400 block">
                <strong className="text-slate-300">Port Tersedia:</strong> {nearestOdp.total_ports - (nearestOdp.used_ports || 0)} dari {nearestOdp.total_ports} Port
              </span>
            </div>
          )}
        </div>

        {/* ODP Splitter Port Selector */}
        <div className="glass-panel p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pilih Port ODP Tersedia</h3>
            <span className="text-[10px] font-bold text-brand-400 uppercase bg-brand-500/10 px-2 py-0.5 rounded-full">{activeOdp?.name || 'Pilih ODP'}</span>
          </div>

          <p className="text-[11px] text-slate-500 mb-3">Klik salah satu nomor port kosong di bawah untuk menghubungkan pelanggan baru.</p>

          <div className="grid grid-cols-4 gap-2">
            {activeOdp ? (
              Array.from({ length: activeOdp.total_ports || 8 }, (_, i) => {
                const portNum = i + 1;
                const usedPortsCount = activeOdp.used_ports || 0;
                // Since individual port mappings are simulated from counts in current DB model:
                const isActive = portNum <= usedPortsCount;
                const isSelected = selectedPort === portNum;

                let colorClass = 'bg-slate-950 border-slate-800 hover:border-brand-500 text-slate-400';
                if (isActive) colorClass = 'bg-slate-800/80 border-indigo-500/30 text-indigo-400 cursor-not-allowed opacity-60';
                if (isSelected) colorClass = 'bg-brand-500 border-brand-300 text-white font-black filter drop-shadow-[0_0_6px_rgba(139,92,246,0.6)] scale-105';

                return (
                  <button
                    key={portNum}
                    disabled={isActive}
                    onClick={() => handlePortClick(portNum, activeOdp)}
                    className={`py-2 px-1 rounded-lg border text-center text-[10px] font-bold transition-all ${colorClass}`}
                    title={isActive ? 'Port Terpakai' : `Port ${portNum} Tersedia`}
                  >
                    P-{portNum}
                  </button>
                );
              })
            ) : (
              <div className="col-span-4 p-6 text-center text-xs text-slate-500">Pilih ODP di peta untuk memuat nomor port</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomMap;
