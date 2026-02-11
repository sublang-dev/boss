// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://www.sublang.ai>

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use a hoisted mutable mock so we can configure behavior per test.
const mockExecFile = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', async (importOriginal) => {
  const orig = await importOriginal<typeof import('node:child_process')>();
  return { ...orig, execFile: mockExecFile };
});

// ── podmanErrorMessage (pure function, no mocking needed) ──

describe('podmanErrorMessage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('returns install message for ENOENT', async () => {
    const { podmanErrorMessage } = await import('../../src/utils/podman.js');
    const msg = podmanErrorMessage({ code: 'ENOENT' });
    expect(msg).toContain('not installed');
    expect(msg).toContain('iteron init');
  });

  it('extracts last line from stderr', async () => {
    const { podmanErrorMessage } = await import('../../src/utils/podman.js');
    const msg = podmanErrorMessage({
      stderr: 'line1\nline2\nError: container not found',
    });
    expect(msg).toBe('container not found');
  });

  it('strips Error: prefix from stderr', async () => {
    const { podmanErrorMessage } = await import('../../src/utils/podman.js');
    const msg = podmanErrorMessage({ stderr: 'Error: something failed' });
    expect(msg).toBe('something failed');
  });

  it('falls back to message property', async () => {
    const { podmanErrorMessage } = await import('../../src/utils/podman.js');
    const msg = podmanErrorMessage({ message: 'general error' });
    expect(msg).toBe('general error');
  });

  it('falls back to String() for unknown errors', async () => {
    const { podmanErrorMessage } = await import('../../src/utils/podman.js');
    const msg = podmanErrorMessage('raw string error');
    expect(msg).toBe('raw string error');
  });
});

// ── Mocked podmanExec tests ──

describe('isPodmanInstalled', () => {
  beforeEach(() => {
    mockExecFile.mockReset();
    vi.resetModules();
  });

  it('returns true when podman --version succeeds', async () => {
    mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
      cb(null, 'podman version 5.4.1\n', '');
    });
    const { isPodmanInstalled } = await import('../../src/utils/podman.js');
    expect(await isPodmanInstalled()).toBe(true);
  });

  it('returns false when podman is not found', async () => {
    mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
      cb(Object.assign(new Error('not found'), { code: 'ENOENT' }));
    });
    const { isPodmanInstalled } = await import('../../src/utils/podman.js');
    expect(await isPodmanInstalled()).toBe(false);
  });
});

describe('imageExists', () => {
  beforeEach(() => {
    mockExecFile.mockReset();
    vi.resetModules();
  });

  it('returns true when image exists', async () => {
    mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
      cb(null, '', '');
    });
    const { imageExists } = await import('../../src/utils/podman.js');
    expect(await imageExists('alpine:latest')).toBe(true);
  });

  it('returns false when image does not exist', async () => {
    mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
      cb(new Error('image not found'));
    });
    const { imageExists } = await import('../../src/utils/podman.js');
    expect(await imageExists('nonexistent:image')).toBe(false);
  });
});

describe('containerExists', () => {
  beforeEach(() => {
    mockExecFile.mockReset();
    vi.resetModules();
  });

  it('returns true when container exists', async () => {
    mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
      cb(null, '{}', '');
    });
    const { containerExists } = await import('../../src/utils/podman.js');
    expect(await containerExists('test-container')).toBe(true);
    expect(mockExecFile.mock.calls[0]?.[1]).toEqual(['container', 'inspect', 'test-container']);
  });

  it('returns false when container does not exist', async () => {
    mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
      cb(new Error('no such container'));
    });
    const { containerExists } = await import('../../src/utils/podman.js');
    expect(await containerExists('nonexistent')).toBe(false);
    expect(mockExecFile.mock.calls[0]?.[1]).toEqual(['container', 'inspect', 'nonexistent']);
  });
});

describe('isContainerRunning', () => {
  beforeEach(() => {
    mockExecFile.mockReset();
    vi.resetModules();
  });

  it('returns true when container is running', async () => {
    mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
      cb(null, 'true\n', '');
    });
    const { isContainerRunning } = await import('../../src/utils/podman.js');
    expect(await isContainerRunning('test-container')).toBe(true);
    expect(mockExecFile.mock.calls[0]?.[1]).toEqual(['container', 'inspect', 'test-container', '--format', '{{.State.Running}}']);
  });

  it('returns false when container is not running', async () => {
    mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
      cb(null, 'false\n', '');
    });
    const { isContainerRunning } = await import('../../src/utils/podman.js');
    expect(await isContainerRunning('test-container')).toBe(false);
    expect(mockExecFile.mock.calls[0]?.[1]).toEqual(['container', 'inspect', 'test-container', '--format', '{{.State.Running}}']);
  });
});

describe('volumeExists', () => {
  beforeEach(() => {
    mockExecFile.mockReset();
    vi.resetModules();
  });

  it('returns true when volume exists', async () => {
    mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
      cb(null, '{}', '');
    });
    const { volumeExists } = await import('../../src/utils/podman.js');
    expect(await volumeExists('iteron-data')).toBe(true);
  });

  it('returns false when volume does not exist', async () => {
    mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
      cb(new Error('no such volume'));
    });
    const { volumeExists } = await import('../../src/utils/podman.js');
    expect(await volumeExists('nonexistent')).toBe(false);
  });
});
