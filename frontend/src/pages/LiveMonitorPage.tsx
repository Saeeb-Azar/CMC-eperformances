import Header from '../components/layout/Header';
import StatusBadge from '../components/ui/StatusBadge';
import { Radio, ArrowRight } from 'lucide-react';

const stations = ['Scanner', 'Induction', '3D Sensor', 'Wrapper', 'Labeler', 'Exit Verifier'];

const demoConveyor = [
  { ref: 'ref-0485', state: 'LABELED', station: 4, barcode: '4052400033054' },
  { ref: 'ref-0483', state: 'SCANNED', station: 3, barcode: '4062196101493' },
  { ref: 'ref-0488', state: 'INDUCTED', station: 1, barcode: 'M320015' },
];

const demoMachines = [
  { id: 'CW-001', status: 'RUNNING', online: true, items: 2, throughput: 34 },
  { id: 'CW-002', status: 'RUNNING', online: true, items: 1, throughput: 28 },
  { id: 'CW-003', status: 'STOP', online: false, items: 0, throughput: 0 },
];

export default function LiveMonitorPage() {
  return (
    <div>
      <Header title="Live Monitor" subtitle="Real-time conveyor belt status" />

      <div className="p-8 space-y-6">
        {/* Machine status cards */}
        <div className="grid grid-cols-3 gap-4">
          {demoMachines.map((m) => (
            <div
              key={m.id}
              className={`bg-surface rounded-xl border p-5 ${
                m.online ? 'border-accent' : 'border-border'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Radio
                    size={14}
                    className={m.online ? 'text-accent animate-pulse' : 'text-text-muted'}
                  />
                  <span className="font-medium text-text-primary">{m.id}</span>
                </div>
                <StatusBadge status={m.status} />
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-text-muted text-xs">Items on belt</p>
                  <p className="font-semibold text-text-primary">{m.items}</p>
                </div>
                <div>
                  <p className="text-text-muted text-xs">Throughput/h</p>
                  <p className="font-semibold text-text-primary">{m.throughput}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Conveyor Visualization */}
        <div className="bg-surface rounded-xl border border-border p-6">
          <h3 className="text-sm font-medium text-text-primary mb-6">
            Conveyor Belt - CW-001
          </h3>

          {/* Station flow */}
          <div className="flex items-center justify-between mb-8 px-4">
            {stations.map((station, idx) => (
              <div key={station} className="flex items-center gap-2">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-20 h-20 rounded-xl border-2 flex items-center justify-center text-xs text-center font-medium transition-all ${
                      demoConveyor.some((item) => item.station === idx)
                        ? 'border-accent bg-green-50 text-accent'
                        : 'border-border bg-surface-secondary text-text-muted'
                    }`}
                  >
                    {station}
                  </div>
                  {/* Items at this station */}
                  <div className="mt-2 min-h-[28px]">
                    {demoConveyor
                      .filter((item) => item.station === idx)
                      .map((item) => (
                        <div
                          key={item.ref}
                          className="bg-sidebar text-white text-xs px-2 py-1 rounded-md font-mono"
                        >
                          {item.ref}
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
              {demoConveyor.map((item) => (
                <div key={item.ref} className="py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-mono text-text-primary">{item.ref}</span>
                    <span className="text-xs text-text-muted">{item.barcode}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-text-secondary">{stations[item.station]}</span>
                    <StatusBadge status={item.state} />
                  </div>
                </div>
              ))}
              {demoConveyor.length === 0 && (
                <p className="py-8 text-center text-text-muted text-sm">
                  No items currently on the conveyor
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
