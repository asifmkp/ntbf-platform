import { AgentService } from './agent.service';

describe('AgentService.toolsForRole', () => {
  const svc = new AgentService({} as any);

  it('scopes salesman tools (create_customer, place_order) and hides finance tools', () => {
    const names = svc.toolsForRole('salesman').map((t) => t.name);
    expect(names).toContain('create_customer');
    expect(names).toContain('place_order');
    expect(names).not.toContain('clear_cheque');
  });

  it('gives the driver routing but not customer creation', () => {
    const names = svc.toolsForRole('driver').map((t) => t.name);
    expect(names).toContain('plan_route');
    expect(names).not.toContain('create_customer');
  });

  it('exposes shared read tools to every role', () => {
    expect(svc.toolsForRole('finance').map((t) => t.name)).toContain('get_overview');
    expect(svc.toolsForRole('warehouse').map((t) => t.name)).toContain('get_replenishment');
  });

  it('only the customer role can place its own order', () => {
    expect(svc.toolsForRole('customer').map((t) => t.name)).toContain('place_my_order');
    expect(svc.toolsForRole('salesman').map((t) => t.name)).not.toContain('place_my_order');
  });

  it('reports configuration status from the AI service', () => {
    const configured = new AgentService({ configured: true } as any);
    expect(configured.status()).toEqual({ configured: true });
  });
});
