import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { NotificationProvider, useNotification } from '../src/utils/notificationUtils.jsx';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));

let api;
const Probe = () => { api = useNotification(); return null; };
const setup = () => render(<NotificationProvider><Probe /></NotificationProvider>);

afterEach(cleanup);

it('runs a toast action and then closes the toast', async () => {
  const onClick = vi.fn();
  setup();

  act(() => { api.success('Movimento eliminato', { action: { label: 'Annulla', onClick } }); });

  fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));

  expect(onClick).toHaveBeenCalledOnce();
  await waitFor(() => expect(screen.queryByText('Movimento eliminato')).toBeNull());
});

it('suppresses duplicate plain toasts but keeps identical actionable ones', async () => {
  setup();

  act(() => {
    api.error('Errore di rete');
    api.error('Errore di rete');
  });
  expect(screen.getAllByText('Errore di rete')).toHaveLength(1);

  act(() => {
    api.success('Movimento eliminato', { action: { label: 'Annulla', onClick: vi.fn() } });
    api.success('Movimento eliminato', { action: { label: 'Annulla', onClick: vi.fn() } });
  });
  expect(screen.getAllByText('Movimento eliminato')).toHaveLength(2);
});

it('closes a toast pushed out of the stack so deferred work still runs', () => {
  const onClose = vi.fn();
  setup();

  act(() => {
    api.success('uno', { onClose });
    api.info('due');
    api.info('tre');
    api.info('quattro');
  });

  expect(onClose).toHaveBeenCalledOnce();
  expect(screen.queryByText('uno')).toBeNull();
  expect(screen.getByText('quattro')).toBeTruthy();
});
