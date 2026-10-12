"use client";

import { useState } from 'react';
import { FileUp, Play, Download, Printer, RefreshCcw } from 'lucide-react';

export default function Page() {
  const [jsonInput, setJsonInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      setJsonInput(evt.target.result);
    };
    reader.readAsText(file);
  };

  const handleLoadSample = () => {
    // Generate a basic valid sample for demonstration
    const sample = {
      "grid_available": [true, false, false, true, false, false, true, true, false, true],
      "generator_capacity_kw": 100,
      "fuel_budget_litres": 50.0,
      "max_consecutive_dark": 2,
      "fuel_table": [
        {"load_kw": 30, "litres_per_hour": 1.5},
        {"load_kw": 70, "litres_per_hour": 3.2},
        {"load_kw": 100, "litres_per_hour": 5.0}
      ],
      "shops": [
        {
          "id": "A_MANDATORY",
          "kw": 20,
          "type": "mandatory",
          "value_per_slot": [10, 10, 10, 10, 10, 10, 10, 10, 10, 10]
        },
        {
          "id": "B_NORMAL",
          "kw": 40,
          "type": "normal",
          "value_per_slot": [5, 15, 25, 5, 20, 10, 5, 5, 30, 5]
        },
        {
          "id": "C_NORMAL",
          "kw": 30,
          "type": "normal",
          "value_per_slot": [10, 5, 10, 15, 5, 25, 10, 10, 5, 10]
        }
      ]
    };
    setJsonInput(JSON.stringify(sample, null, 2));
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    let parsed;
    try {
      parsed = JSON.parse(jsonInput);
    } catch (e) {
      setError("Invalid JSON syntax.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed)
      });
      
      const data = await res.json();
      if (!res.ok) {
        setError(data.errors ? data.errors.join("\\n") : "An error occurred.");
      } else {
        setResult(data);
      }
    } catch (err) {
      setError("Network error communicating with the API.");
    }
    setLoading(false);
  };

  const handleDownload = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "roster_result.json";
    a.click();
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-3xl font-bold text-primary-700 tracking-tight">Who Stays On?</h1>
          <p className="text-slate-500 mt-1 text-sm sm:text-base">Generator & Load-Shedding Optimization Engine</p>
        </div>
      </header>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4 no-print">
          <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-semibold mb-3">Input Configuration</h2>
            
            <div className="space-y-4">
              <div className="flex gap-2">
                <label className="flex-1 flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 px-4 rounded-lg cursor-pointer transition-colors text-sm font-medium">
                  <FileUp size={16} />
                  Upload JSON
                  <input type="file" accept=".json" className="hidden" onChange={handleFileUpload} />
                </label>
                <button 
                  onClick={handleLoadSample}
                  className="flex-1 flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 px-4 rounded-lg transition-colors text-sm font-medium"
                >
                  Load Sample
                </button>
              </div>

              <textarea 
                className="w-full h-64 p-3 border border-slate-200 rounded-lg font-mono text-xs focus:ring-2 focus:ring-primary-500 outline-none resize-none"
                placeholder="Paste JSON configuration here..."
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
              />

              <button 
                onClick={handleSubmit}
                disabled={loading || !jsonInput.trim()}
                className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-3 px-4 rounded-lg transition-colors font-medium shadow-sm"
              >
                {loading ? <RefreshCcw className="animate-spin" size={18} /> : <Play size={18} />}
                {loading ? "Optimizing..." : "Run Optimizer"}
              </button>
            </div>
            
            {error && (
              <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg border border-red-100 text-sm whitespace-pre-wrap">
                <strong>Error:</strong><br/>{error}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {result ? (
            <div className="space-y-6 print:space-y-4">
              <div className="flex flex-wrap gap-3 justify-between items-center no-print">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  Optimization Results
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase ${
                    result.status === 'ok' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {result.status}
                  </span>
                </h2>
                
                <div className="flex gap-2">
                  <button onClick={handleDownload} className="flex items-center gap-2 text-sm bg-white border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg shadow-sm">
                    <Download size={16} /> Download
                  </button>
                  <button onClick={handlePrint} className="flex items-center gap-2 text-sm bg-white border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg shadow-sm">
                    <Printer size={16} /> Print
                  </button>
                </div>
              </div>

              {result.status === 'ok' ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Status</p>
                      <p className="text-xl font-bold text-green-600 mt-1">Optimal ✓</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Total Value</p>
                      <p className="text-xl font-bold text-slate-800 mt-1">{result.value_total.toLocaleString()}</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Fuel Used</p>
                      <p className="text-xl font-bold text-slate-800 mt-1">{result.fuel_total_litres} L</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Outage Hours</p>
                      <p className="text-xl font-bold text-slate-800 mt-1">{Object.keys(result.roster).length}</p>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/50">
                      <h3 className="font-semibold text-slate-800">Shop Schedule</h3>
                    </div>
                    <div className="p-0 overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3">Shop</th>
                            <th className="px-4 py-3 text-center">Type</th>
                            {Array.from({length: 10}).map((_, i) => (
                              <th key={i} className="px-2 py-3 text-center whitespace-nowrap">
                                {10 + i}:00
                              </th>
                            ))}
                            <th className="px-4 py-3 text-right">Dark</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {Object.entries(result.dark_hours).map(([shopId, darkCount]) => (
                            <tr key={shopId} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-3 font-medium text-slate-800">{shopId}</td>
                              <td className="px-4 py-3 text-center">
                                {/* Type inferred from input since result only has dark_hours natively; but we'll show just ID and dark hours properly */}
                                -
                              </td>
                              {Array.from({length: 10}).map((_, t) => {
                                const slot = result.roster[`slot_${t}`];
                                if (!slot) return <td key={t} className="px-2 py-3 text-center text-slate-400 font-medium text-xs">GRID</td>;
                                const isPowered = slot.powered.includes(shopId);
                                const isDark = slot.dark.find(d => d.id === shopId);
                                
                                return (
                                  <td key={t} className="px-2 py-3 text-center">
                                    {isPowered ? (
                                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-green-700 font-bold" title="Powered">✓</span>
                                    ) : (
                                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-red-600 font-bold cursor-help" title={isDark?.reason}>✗</span>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="px-4 py-3 text-right font-medium">
                                <span className={darkCount > 0 ? 'text-amber-600' : 'text-slate-600'}>
                                  {darkCount}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                    <h3 className="font-semibold text-slate-800 mb-4">Dark Explanations</h3>
                    <div className="space-y-4">
                      {Object.keys(result.roster).length === 0 ? (
                        <p className="text-slate-500 text-sm">No outage hours occurred.</p>
                      ) : (
                        Object.entries(result.roster).map(([slotKey, data]) => {
                          if (data.dark.length === 0) return null;
                          const hourStr = 10 + parseInt(slotKey.split('_')[1]) + ":00";
                          return (
                            <div key={slotKey} className="border-l-2 border-amber-300 pl-4">
                              <h4 className="font-medium text-sm text-slate-700">{hourStr}</h4>
                              <ul className="mt-2 space-y-2">
                                {data.dark.map(d => (
                                  <li key={d.id} className="text-sm">
                                    <span className="font-medium text-slate-800">{d.id}:</span> <span className="text-slate-600">{d.reason}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-red-50 text-red-800 p-6 rounded-xl border border-red-100">
                  <h3 className="text-lg font-bold mb-2">Infeasible Schedule</h3>
                  <p>{result.reason}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl h-full min-h-[400px] flex flex-col items-center justify-center text-slate-400 no-print">
              <Play size={48} className="mb-4 opacity-20" />
              <p>Enter configuration and run optimizer to see results</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}