import { describe, it, expect } from 'vitest';
import { loadRegisterMap } from '../src/registerMap';
import { join } from 'path';
describe('RegisterMap loader', () => {
    it('loads sample mapping and expands ranges', async () => {
        const file = join(process.cwd(), 'config', 'register-map.yaml');
        const rm = await loadRegisterMap(file);
        const all = rm.listAll();
        expect(all.length).toBeGreaterThan(0);
        const m1 = rm.lookupByAddress(1);
        expect(m1).not.toBeNull();
        expect(m1?.topicResolved).toBe('sensors/op1/temperature');
    });
        it('contains humidity mapping', async () => {
            const file = join(process.cwd(), 'config', 'register-map.yaml');
            const rm = await loadRegisterMap(file);
            const m13 = rm.lookupByAddress(13);
            expect(m13).not.toBeNull();
            expect(m13?.datatype).toBe('uint16');
            expect(m13?.topicResolved).toBe('sensors/wr/humidity');
        });
});
