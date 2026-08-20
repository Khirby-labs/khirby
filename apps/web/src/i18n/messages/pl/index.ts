/**
 * The `pl` bundle — lazily imported by loadLocale().
 *
 * `satisfies MessageSchema` is the completeness gate: a key missing from Polish,
 * or one that exists only in Polish, fails `vue-tsc`. That is why a locale ships
 * complete or is not registered at all (ADR-0011).
 */
import type { MessageSchema } from '../../index';
import auth from './auth.json';
import common from './common.json';
import contacts from './contacts.json';
import errors from './errors.json';
import forms from './forms.json';
import mail from './mail.json';
import marketplace from './marketplace.json';
import nav from './nav.json';
import newsletter from './newsletter.json';
import pipeline from './pipeline.json';
import plugins from './plugins.json';
import roles from './roles.json';
import route from './route.json';
import settings from './settings.json';
import shell from './shell.json';
import boards from './boards.json';
import users from './users.json';
import agent from './agent.json';

export default {
  auth,
  common,
  contacts,
  errors,
  forms,
  mail,
  marketplace,
  nav,
  newsletter,
  pipeline,
  plugins,
  roles,
  route,
  settings,
  shell,
  boards,
  users,
  agent,
} satisfies MessageSchema;
