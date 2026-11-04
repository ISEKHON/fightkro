export interface StageSim {
  id: string;
  name: string;
  zones: number;
  zoneNames: string[];
  props: { kind: string; x: number }[];
  hazard: string;
  finisher: string;
}

export const STAGE_SIM: Record<string, StageSim> = {
  assembly: {
    id: 'assembly',
    name: 'LOKTANTRA BHAVAN',
    zones: 3,
    zoneNames: ['Main Chamber', 'Marble Lobby', 'Rajpath Lawns'],
    props: [
      { kind: 'chair', x: -4.5 },
      { kind: 'mic', x: 4.2 },
    ],
    hazard: 'bull',
    finisher: 'Thrown into the Speaker’s Well',
  },
  maidan: {
    id: 'maidan',
    name: 'ANDOLAN MAIDAN',
    zones: 2,
    zoneNames: ['Protest Ground', 'Barricade Line'],
    props: [
      { kind: 'placard', x: -3.8 },
      { kind: 'lathi', x: 4.8 },
    ],
    hazard: 'bull',
    finisher: 'Trampled by the Rally',
  },
  tollplaza: {
    id: 'tollplaza',
    name: 'NH-420 TOLL PLAZA',
    zones: 3,
    zoneNames: ['Toll Lanes', 'Highway', 'Rally Truck'],
    props: [
      { kind: 'cone', x: -5 },
      { kind: 'lathi', x: 3.6 },
    ],
    hazard: 'convoy',
    finisher: 'Crushed by the Toll Barrier',
  },
  studio: {
    id: 'studio',
    name: 'PRIME TIME STUDIO',
    zones: 2,
    zoneNames: ['Debate Floor', 'Control Room'],
    props: [
      { kind: 'mic', x: -4 },
      { kind: 'chair', x: 4.4 },
    ],
    hazard: 'bull',
    finisher: 'Smashed through the Video Wall',
  },
};

export const STAGE_IDS = Object.keys(STAGE_SIM);
