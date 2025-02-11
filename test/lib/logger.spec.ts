import { expect } from 'chai';
import { logger } from '../../lib/logger.js';

// TODO: validate JSON format, including restructure
// TODO: validate metadata
// TODO: validate minLevel

describe('Validate ErrorTrackingLogger behaviour', function () {
  // hasError should start out false, and once error/fatal message has been
  // emitted, should be set to true, and stay that way.
  logger.hasError = false; // reset

  expect(logger.hasError).to.be.false;
  logger.trace('sample message');
  expect(logger.hasError).to.be.false;
  logger.debug('sample message');
  expect(logger.hasError).to.be.false;
  logger.info('sample message');
  expect(logger.hasError).to.be.false;
  logger.warn('sample message');
  expect(logger.hasError).to.be.false;
  logger.error('sample message');
  expect(logger.hasError).to.be.true;
  logger.fatal('sample message');
  expect(logger.hasError).to.be.true;
  logger.info('sample message');
  expect(logger.hasError).to.be.true;

  logger.hasError = false; // reset
});
