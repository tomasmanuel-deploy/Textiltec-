
import { SeriesStore } from '../../lib/seriesStore';
import fs from 'fs';
import path from 'path';

// Mock fs
jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('SeriesStore', () => {
  const mockSeriesPath = '/mock/data/series.json';

  beforeEach(() => {
    jest.clearAllMocks();
    mockedFs.existsSync.mockReturnValue(false); // Default: file doesn't exist
    mockedFs.readFileSync.mockReturnValue('');
    mockedFs.writeFileSync.mockImplementation(() => {});
  });

  test('should seed default series with correct codes when file is missing', () => {
    const store = new SeriesStore('series.json');
    
    // Verify writeFileSync was called to save defaults
    // It might be called twice: once for initialization (empty) and once after seeding
    expect(mockedFs.writeFileSync).toHaveBeenCalled();
    
    // Get the last call to writeFileSync
    const calls = mockedFs.writeFileSync.mock.calls;
    const lastCall = calls[calls.length - 1];
    const savedData = JSON.parse(lastCall[1] as string);
    const series = savedData.series;

    expect(series.length).toBeGreaterThan(0);
    
    // Check for FT code
    const ftSeries = series.find((s: any) => s.code === 'FT');
    expect(ftSeries).toBeDefined();
    expect(ftSeries.documentType).toBe('factura');
    expect(ftSeries.active).toBe(true);

    // Check for NC code
    const ncSeries = series.find((s: any) => s.code === 'NC');
    expect(ncSeries).toBeDefined();
    expect(ncSeries.documentType).toBe('nota_de_credito');
  });

  test('should load existing series if file exists', () => {
    const existingData = {
      series: [
        { code: 'FT', documentType: 'factura', year: 2023, currentNumber: 10 }
      ],
      lastUpdated: new Date().toISOString()
    };
    
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(JSON.stringify(existingData));

    const store = new SeriesStore('series.json');
    const allSeries = store.getAllSeries();

    expect(allSeries).toHaveLength(1);
    expect(allSeries[0].currentNumber).toBe(10);
    // Should NOT have seeded defaults
    expect(mockedFs.writeFileSync).not.toHaveBeenCalled();
  });
});
