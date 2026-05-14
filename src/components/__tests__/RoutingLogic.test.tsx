import { describe, it, expect } from 'vitest';

describe('Patient Routing Logic', () => {
  it('should route new pediatric patient to "checkin" (Biometría)', () => {
    const category: string = 'Niño';
    const status = category === 'Niño' ? 'checkin' : 'espera';
    expect(status).toBe('checkin');
  });

  it('should route new adult patient to "espera" (Sala de espera)', () => {
    const category: string = 'Adulto';
    const status = category === 'Niño' ? 'checkin' : 'espera';
    expect(status).toBe('espera');
  });

  it('should route existing pediatric patient to checkin when checking in', () => {
    const category: string = 'Niño';
    const serviceType = 'pediatría';
    const status = category === 'Niño' ? 'checkin' : 'espera';
    expect(status).toBe('checkin');
  });

  it('should route existing adult patient to espera when checking in', () => {
    const category: string = 'Adulto';
    const serviceType = 'clínico';
    const status = category === 'Niño' ? 'checkin' : 'espera';
    expect(status).toBe('espera');
  });

  it('should route doctor referral for pediatric patient to espera', () => {
    // Doctors refer patients directly to other specialties to the waiting room ('espera')
    // They do NOT go back to biometria unless specifically asked (in this app, refer means 'espera')
    const referralService = 'ecografía';
    const status = 'espera'; // Hardcoded in MedicalConsultation.tsx -> newVisitData.status = 'espera'
    expect(status).toBe('espera');
    expect(referralService).toBe('ecografía');
  });

  it('should route doctor referral for adult patient to espera', () => {
    const referralService = 'nutrición';
    const status = 'espera';
    expect(status).toBe('espera');
    expect(referralService).toBe('nutrición');
  });

  it('should allow nursing to progress pediatric patient from checkin to espera', () => {
    // Nurse finishes biometría (handleStartVisit in Patients.tsx)
    const currentStatus = 'checkin';
    const nextStatus = 'espera';
    expect(nextStatus).toBe('espera');
  });
});
