/**
 * The `en` bundle. Eagerly imported: it is the fallback locale, so it must be
 * present before anything renders. `typeof` this object is the MessageSchema
 * every other locale is checked against.
 */
import auth from './auth.json';
import common from './common.json';
import contacts from './contacts.json';
import errors from './errors.json';
import forms from './forms.json';
import mail from './mail.json';
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

export default {
  auth,
  common,
  contacts,
  errors,
  forms,
  mail,
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
};
