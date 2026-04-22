import { useEffect, useState } from 'react';
import Header from '../components/layout/Header';
import StatusBadge from '../components/ui/StatusBadge';
import { Radio, ArrowRight } from 'lucide-react';
import { api, type MachineRead, type OrderStateRead } from '../services/api';

const stations = ['Scanner', 'Induction', '3D Sensor', 'Wrapper', 'Labeler', 'Exit Verifier'];

// Map order state → conveyor station index
const STATE_TO_STATION: Record<string, number> = {
  ASSIGNED: 0,
  INDUCTED: 1,
  SCANNED: 2,
  MEASURED: 2,
  WRAPPED: 3,
  LABELED: 4,
  VERIFYING: 5,
};

export default function LiveMonitorPage() {
  const [machines, setMachines] = useState<MachineRead[]>([]);
  const [activeByMachine, setActiveByMachine] = useState<Record<string, OrderStateRead[]>>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const list = await api.listMachines();
        if (cancelled) return;
        setMachines(list);
        const entries = await Promise.all(
          list.map(async (m) => {
            try {
              return [m.id, await api.getActiveOrders(m.id)] as const;
            } catch {
              return [m.id, []] as const;
            }
          })
        );
        if (cancelled) return;
        setActiveByMachine(Object.fromEntries(entries));
      } catch {
        if (!cancelled) {
          setMachines([]);
          setActiveByMachine({});
        }
      }
    };
    load();
    const interval = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const selected = machines[0];
  const conveyor = (selected ? activeByMachine[selected.id] : []) ?? [];

  return (
    <div>
      <Header title="Live Monitor" subtitle="Real-time conveyor belt status" />

      <div className="p-8 space-y-6">
        {/* Machine status cards */}
        {machines.length === 0 ? (
          <div className="bg-surface rounded-xl border border-border p-8 text-center text-text-muted text-sm">
            No machines configured yet
          </div>
        ) : (
          <div className={`grid gap-4`} style={{ gridTemplateColumns: `repeat(${Math.min(machines.length, 4)}, minmax(0, 1fr))` }}>
            {machines.map((m) => {
              const active = activeByMachine[m.id] ?? [];
              return (
                <div
                  key={m.id}
                  className={`bg-surface rounded-xl border p-5 ${m.is_online ? 'border-accent' : 'border-border'}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Radio
                        size={14}
                        className={m.is_online ? 'text-accent animate-pulse' : 'text-text-muted'}
                      />
                      <span className="font-medium text-text-primary">{m.name}</span>
                    </div>
                    <StatusBadge status={m.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-text-muted text-xs">Items on belt</p>
                      <p className="font-semibold text-text-primary">{active.length}</p>
                    </div>
                    <div>
                      <p className="text-text-muted text-xs">ENQ sequence</p>
                      <p className="font-semibold text-text-primary tabular-nums">{m.enq_sequence.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Conveyor Visualization */}
        {selected && (
          <div className="bg-surface rounded-xl border border-border p-6">
            <h3 className="text-sm font-medium text-text-primary mb-6">
              Conveyor Belt - {selected.name}
            </h3>

            {/* Station flow */}
            <div className="flex items-center justify-between mb-8 px-4">
              {stations.map((station, idx) => (
                <div key={station} className="flex items-center gap-2">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-20 h-20 rounded-xl border-2 flex items-center justify-center text-xs text-center font-medium transition-all ${
                        conveyor.some((item) => STATE_TO_STATION[item.state] === idx)
                          ? 'border-accent bg-green-50 text-accent'
                          : 'border-border bg-surface-secondary text-text-muted'
                      }`}
                    >
                      {station}
                    </div>
                    <div className="mt-2 min-h-[28px]">
                      {conveyor
                        .filter((item) => STATE_TO_STATION[item.state] === idx)
                        .map((item) => (
                          <div
                            key={item.id}
                            className="bg-sidebar text-white text-xs px-2 py-1 rounded-md font-mono"
                          >
                            {item.reference_id}
                          </div>
                        ))}
                    </div>
                  </div>
                  {idx < stations.length - 1 && (
                    <ArrowRight size={16} className="text-text-muted mt-[-28px]" />
                  )}
                </div>
              ))}
            </div>

            {/* Active items table */}
            <div className="border-t border-border pt-4">
              <h4 className="text-xs font-medium text-text-secondary uppercase mb-3">
                Active Items on Conveyor
              </h4>
              <div className="divide-y divide-border-light">
                {conveyor.length === 0 ? (
                  <p className="py-8 text-center text-text-muted text-sm">
                    No items currently on the conveyor
                  </p>
                ) : (
                  conveyor.map((item) => (
                    <div key={item.id} className="py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-mono text-text-primary">{item.reference_id}</span>
                        <span className="text-xs text-text-muted">{item.barcode}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-text-secondary">
                          {stations[STATE_TO_STATION[item.state] ?? 0]}
                        </span>
                        <StatusBadge status={item.state} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
