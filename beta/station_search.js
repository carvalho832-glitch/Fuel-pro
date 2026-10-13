/* Fuel Pro Beta: local-only station index, no geocoding or paid calls. */
(function(global) {
  'use strict';
  function normalize(value) {
    return String(value == null ? '' : value)
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
  }
  function digits(value) {
    return String(value == null ? '' : value).replace(/\D/g,'');
  }
  function stationIndex(station) {
    const area = station.city === 'ARARAQUARA' ? 'Araraquara' :
      station.city === 'SAO JOSE DOS CAMPOS' ? 'São José dos Campos' : '';
    return {
      haystack: normalize([
        station.name, station.address, station.district, station.brand,
        area, station.cnpj
      ].filter(Boolean).join(' ')),
      cnpjDigits: digits(station.cnpj),
      city: station.city
    };
  }
  function score(station, query, activeCity) {
    const q = normalize(query);
    const d = digits(query);
    const index = stationIndex(station);
    if (!q) return null;
    const tokens = q.split(' ').filter(Boolean);
    if (!tokens.every(token => index.haystack.includes(token))) {
      if (!(d.length >= 3 && index.cnpjDigits.includes(d))) return null;
    }
    const exactCnpj = d.length >= 3 && index.cnpjDigits === d;
    const cnpjMatch = d.length >= 3 && index.cnpjDigits.includes(d);
    const normalizedName = normalize(station.name);
    let rank = exactCnpj ? 0 : cnpjMatch ? 1
      : normalizedName === q ? 2
      : normalizedName.startsWith(q) ? 3
      : index.haystack.includes(q) ? 4 : 5;
    // Only tie break on selected municipality. Other cities remain searchable.
    if (activeCity && activeCity !== 'ALL' && station.city !== activeCity) rank += 0.5;
    return rank;
  }
  function searchStations(stations, query, activeCity, limit) {
    if (!Array.isArray(stations)) return {matches:[],total:0};
    const text = String(query == null ? '' : query).trim();
    if (normalize(text).length < 2) return {matches:[],total:0};
    const found = [];
    for (const p of stations) {
      if (!p || typeof p !== 'object' || !/^\d{14}$/.test(p.cnpj || '')) continue;
      const rank = score(p, text, activeCity);
      if (rank !== null) found.push({station:p,rank});
    }
    found.sort((a,b)=>a.rank-b.rank ||
      (a.station.name || '').localeCompare(b.station.name || '','pt-BR') ||
      a.station.cnpj.localeCompare(b.station.cnpj));
    const maximum = Number.isInteger(limit) && limit > 0 ? Math.min(limit,100) : 12;
    return {matches:found.slice(0,maximum).map(x=>x.station),total:found.length};
  }
  const api = {normalize, stationIndex, searchStations};
  if (typeof module !== 'undefined' && module.exports) module.exports=api;
  global.FuelProSearch=api;
})(typeof window !== 'undefined' ? window : globalThis);
