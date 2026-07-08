import { CableSchematic } from 'dwes';

export function WiredCables() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: 440, padding: '0.5rem' }}>
      <CableSchematic
        cable={{ ferrule: 'W-4021', color: 'GREEN', size: '2.5', length: '12', source: 'MP-1', destination: 'TB3-04', source_device: 'MP-1', source_terminal: 'X1:4', dest_device: 'TB3', dest_terminal: '04' }}
        status={{ src: true, dst: true }}
        maxLengthMeters={20}
      />
      <CableSchematic
        cable={{ ferrule: 'W-4023', color: 'YELLOW', size: '1.5', length: '8', source: 'MP-2', destination: 'JB-11', source_device: 'MP-2', source_terminal: 'X2:1', dest_device: 'JB-11', dest_terminal: '02' }}
        status={{ src: true, dst: false }}
        maxLengthMeters={20}
      />
      <CableSchematic
        cable={{ ferrule: 'W-4025', color: 'BROWN', size: '4', length: '16', source: 'SP-1', destination: 'TB1-03', source_device: 'SP-1', source_terminal: 'X1:8', dest_device: 'TB1', dest_terminal: '03' }}
        status={{ src: false, dst: false, issue: true, note: 'Length mismatch vs schedule' }}
        maxLengthMeters={20}
      />
    </div>
  );
}
