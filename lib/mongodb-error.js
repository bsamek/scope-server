/**
 * MongoDB driver errors for humans.
 *
 * @todo (imlucas): :axe: to `mongodb-error` module.
 */
var boom = require('boom');
var debug = require('debug')('scout-server:mongodb-error');

/**
 * Is the error returned from the driver caused
 * by an access control restriction?
 *
 * @example
 *   var err = new Error('not authorized on admin to execute '
 *     + 'command { getCmdLineOpts: 1 }');
 *   require('mongodb-error').isNotAuthorized(err);
 *   >>> true
 *
 * @param {Error} [err]
 * @return {Boolean}
 * @api public
 */
exports.isNotAuthorized = function(err) {
  if (!err) return false;
  var msg = err.message || err.err || JSON.stringify(err);
  return new RegExp('^not authorized').test(msg);
};

/**
 * Take errors from the driver and converts them into the appropriate
 * `boom` error instances with more user friendly messages.
 *
 * @param {Error} err - The error from a driver call.
 * @param {Function} fn - Callback which receives a potentially updated `(err)`.
 * @return {void}
 * @api public
 */
exports.decode = function(err, fn) {
  if (err && err.isBoom) {
    debug('no decoding required');
    process.nextTick(fn.bind(null, err));
    return;
  }

  var msg = err.message || err.err || JSON.stringify(err);

  // mongod won't let us connect anymore because we have too many idle
  // connections to it.  Restart the process to flush and get back to
  // a clean state.
  if (/connection closed/.test(msg)) {
    err = boom.serverTimeout('Too many connections to mongod');
  } else if (/cannot drop/.test(msg)) {
    err = boom.badRequest('This index cannot be destroyed');
    err.code = 400;
    err.http = true;
  } else if (/auth failed/.test(msg)) {
    err = boom.forbidden('Invalid auth credentials');
  } else if (/connection to \[.*\] timed out/.test(msg)) {
    err = boom.notFound('Could not connect to MongoDB because the conection timed out');
  } else if (/failed to connect/.test(msg)) { // Host not reachable
    err = boom.notFound('Could not connect to MongoDB.  Is it running?');
  } else if (/does not exist/.test(msg)) {
    err = boom.notFound(msg);
  } else if (/already exists/.test(msg)) {
    err = boom.conflict(msg);
  } else if (/pipeline element 0 is not an object/.test(msg)) {
    err = boom.badRequest(msg);
  } else if (/(target namespace exists|already exists)/.test(err.message)) {
    return boom.conflict('Collection already exists');
  } else if (/server .* sockets closed/.test(msg)) {
    err = boom.serverTimeout('Too many connections to MongoDB');
  } else if (/connect ECONNREFUSED/.test(msg)) {
    err = boom.notFound('MongoDB not running');
  } else {
    // Have a case where we're not properly validating invalid
    // replicaset commands on a deployment with no replicaset.else
    // if (/valid replicaset|No primary found in set/.test(msg)) {
    err = boom.badRequest(msg);
  }

  process.nextTick(fn.bind(null, err));
};

module.exports = exports;