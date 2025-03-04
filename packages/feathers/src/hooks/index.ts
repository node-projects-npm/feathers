import {
  getManager, HookContextData, HookManager, HookMap, HOOKS, hooks, Middleware
} from '../dependencies';
import {
  Service, ServiceOptions, HookContext, FeathersService, Application
} from '../declarations';
import { defaultServiceArguments, getHookMethods } from '../service';
import {
  collectRegularHooks,
  enableRegularHooks
} from './regular';

export {
  fromBeforeHook,
  fromBeforeHooks,
  fromAfterHook,
  fromAfterHooks,
  fromErrorHook,
  fromErrorHooks
} from './regular';

export function createContext (service: Service, method: string, data: HookContextData = {}) {
  const createContext = (service as any)[method].createContext;

  if (typeof createContext !== 'function') {
    throw new Error(`Can not create context for method ${method}`);
  }

  return createContext(data) as HookContext;
}

export class FeathersHookManager<A> extends HookManager {
  constructor (public app: A, public method: string) {
    super();
    this._middleware = [];
  }

  collectMiddleware (self: any, args: any[]): Middleware[] {
    const app = this.app as any as Application;
    const appHooks = app.appHooks[HOOKS].concat(app.appHooks[this.method] || []);
    const regularAppHooks = collectRegularHooks(this.app, this.method);
    const middleware = super.collectMiddleware(self, args);
    const regularHooks = collectRegularHooks(self, this.method);

    return [...appHooks, ...regularAppHooks, ...middleware, ...regularHooks];
  }

  initializeContext (self: any, args: any[], context: HookContext) {
    const ctx = super.initializeContext(self, args, context);

    ctx.params = ctx.params || {};

    return ctx;
  }

  middleware (mw: Middleware[]) {
    this._middleware.push(...mw);
    return this;
  }
}

export function hookMixin<A> (
  this: A, service: FeathersService<A>, path: string, options: ServiceOptions
) {
  if (typeof service.hooks === 'function') {
    return service;
  }

  const app = this;
  const hookMethods = getHookMethods(service, options);

  const serviceMethodHooks = hookMethods.reduce((res, method) => {
    const params = (defaultServiceArguments as any)[method] || [ 'data', 'params' ];

    res[method] = new FeathersHookManager<A>(app, method)
      .params(...params)
      .props({
        app,
        path,
        method,
        service,
        event: null,
        type: null,
        get statusCode () {
          return this.http?.statusCode;
        },
        set statusCode (value: number) {
          (this.http ||= {}).statusCode = value;
        }
      });

    return res;
  }, {} as HookMap);

  const handleRegularHooks = enableRegularHooks(service, hookMethods);

  hooks(service, serviceMethodHooks);

  service.hooks = function (this: any, hookOptions: any) {
    if (hookOptions.before || hookOptions.after || hookOptions.error) {
      return handleRegularHooks.call(this, hookOptions);
    }

    if (Array.isArray(hookOptions)) {
      return hooks(this, hookOptions);
    }

    Object.keys(hookOptions).forEach(method => {
      const manager = getManager(this[method]);

      if (!(manager instanceof FeathersHookManager)) {
        throw new Error(`Method ${method} is not a Feathers hooks enabled service method`);
      }

      manager.middleware(hookOptions[method]);
    });

    return this;
  }

  return service;
}
