import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHAT_MAX_TOKENS, EFFORT, GEN_MODEL } from '../../../pipeline/generate';
const create = vi.hoisted(() => vi.fn());
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create }; } }));
import { POST } from './route';

function request(body: unknown, origin = 'http://localhost:3000') {
  return new Request('http://localhost:3000/api/tutor', {
    method: 'POST', headers: { 'Content-Type': 'application/json', origin }, body: JSON.stringify(body),
  });
}
const valid = { message: 'Help with linear equations', preference: 'steps', diagnosticComplete: true };
afterEach(() => { vi.unstubAllEnvs(); create.mockReset(); });
describe('MVP live tutor boundary', () => {
  it('does not call the model in default presentation mode', async () => {
    vi.stubEnv('STANDUP_DEMO_LIVE_AI', 'false');
    expect((await POST(request(valid))).status).toBe(503);
    expect(create).not.toHaveBeenCalled();
  });
  it('checks the diagnostic, message, and origin before spending tokens', async () => {
    vi.stubEnv('STANDUP_DEMO_LIVE_AI', 'true'); vi.stubEnv('ANTHROPIC_API_KEY', 'unit-test-only');
    expect((await POST(request({ ...valid, diagnosticComplete: false }))).status).toBe(403);
    expect((await POST(request({ ...valid, message: ' ' }))).status).toBe(400);
    expect((await POST(request(valid, 'https://another-site.example'))).status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });
  it('uses the existing repository model with a bounded response', async () => {
    vi.stubEnv('STANDUP_DEMO_LIVE_AI', 'true'); vi.stubEnv('ANTHROPIC_API_KEY', 'unit-test-only');
    create.mockResolvedValue({ content: [{ type: 'text', text: 'Start by subtracting 30 from both sides.' }] });
    const response = await POST(request(valid));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reply: 'Start by subtracting 30 from both sides.' });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ model: GEN_MODEL, max_tokens: CHAT_MAX_TOKENS, output_config: EFFORT }));
  });
  it('returns a safe failure when the model is unavailable', async () => {
    vi.stubEnv('STANDUP_DEMO_LIVE_AI', 'true'); vi.stubEnv('ANTHROPIC_API_KEY', 'unit-test-only');
    create.mockRejectedValue(new Error('private provider details'));
    const response = await POST(request(valid));
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain('private provider details');
  });
});
