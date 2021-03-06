/* eslint new-cap:0 */
/**
 * TODO (imlucas): If we add this as a `--require`
 * option to mocha config, tests will be much cleaner
 * as everything on exports will be a global?
 */
process.env.NODE_ENV = 'testing';

var supertest = require('supertest');
var assert = require('assert');
var app = require('../');
var format = require('util').format;
var _connect = require('mongodb-connection-model').connect;
var resetDeploymentStore = require('mongodb-deployment-model').clear;

var debug = require('debug')('mongodb-scope-server:test:helper');

var ctx = {
  get: function(key) {
    return ctx[key];
  },
  reset: function() {
    Object.keys(ctx).map(function(k) {
      if (typeof ctx[k] !== 'function') {
        return delete ctx[k];
      }
    });
    return ctx;
  }
};

exports.token = function() {
  return ctx.token;
};

exports.addAuthorization = function(req) {
  var token = exports.token();
  if (token) {
    req.set('Authorization', 'Bearer ' + token);
  }
  return req;
};

exports.GET = function(path) {
  var req;
  debug('GET %s', path);
  req = supertest(app).get(path).accept('json');
  exports.addAuthorization(req);
  return req;
};

exports.POST = function(path) {
  var req;
  debug('POST %s', path);
  req = supertest(app).post(path).accept('json').type('json');
  exports.addAuthorization(req);
  return req;
};

exports.DELETE = function(path) {
  var req;
  debug('DELETE %s', path);
  req = supertest(app).del(path).accept('json');
  exports.addAuthorization(req);
  return req;
};

exports.PUT = function(path) {
  var req;
  debug('PUT %s', path);
  req = supertest(app).put(path).accept('json').type('json');
  exports.addAuthorization(req);
  return req;
};

exports.before = exports.setup = function(done) {
  debug('setting up');
  exports.POST('/api/v1/token')
    .send({})
    .expect(201)
    .expect('Content-Type', /json/)
    .end(function(err, res) {
      if (err) {
        return done(err);
      }
      assert(res.body.token);
      ctx.token = res.body.token;
      debug('create token returned', res.body);
      debug('setup complete');
      done();
    });
};

function cleanup(done) {
  ctx.reset();
  resetDeploymentStore(function() {
    debug('teardown complete');
    done();
  });
}

exports.after = exports.teardown = function(done) {
  debug('tearing down');
  if (!ctx.token) {
    return cleanup(done);
  }

  var req = supertest(app).del('/api/v1/token')
    .accept('json')
    .expect(200);
  exports.addAuthorization(req);
  req.end(function(err) {
    if (!err) {
      return done(err);
    }
    cleanup(done);
  });
};

exports.topology = process.env.MONGODB_TOPOLOGY || 'standalone';

exports.when_topology_is = function(topology, fn) {
  return describe(format('When the topology is %s', topology), function() {
    before(function() {
      if (exports.topology !== topology) {
        return this.skip(format('test requires topology `%s`', topology));
      }
    });
    return fn();
  });
};

exports.connect = function(done, fn) {
  var opts = {
    hostname: 'localhost',
    port: 27017
  };
  debug('connect', opts);
  _connect(opts, function(err, conn) {
    if (err) {
      debug('connecting failed', err);
      return done(err);
    }
    debug('successully connected!');
    var db = conn.db('test');
    fn(db);
  });
};

module.exports = exports;

var runner = require('mongodb-runner');
var running = require('is-mongodb-running');

if (!process.env.CI) {
  before(function(done) {
    debug('checking if mongodb is running...');
    running(function(err, res) {
      debug('is-mongodb-running returned', err, res);

      if (res && res.length > 0) {
        if (res[0].port === 27017) {
          debug('mongodb already running on `localhost:27017` so we won\'t start a new one.');
          done();
          return;
        }

        debug('mongodb already running, but its on '
          + '`localhost:%d` and we need `localhost:27017` for '
          + 'the tests so starting up a new one.', res[0].port);
        runner({
          action: 'start'
        }, done);
        return;
      }
      debug('no mongodb running or detection failed so going to try and start one');
      runner({
        action: 'start'
      }, done);
      return;
    });
  });
}
