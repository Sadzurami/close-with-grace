'use strict'

const { promisify } = require('util')
const sleep = promisify(setTimeout)

closeWithGrace.closing = false

function closeWithGrace (opts, fn) {
  if (typeof opts === 'function') {
    fn = opts
    opts = {}
  }

  opts = {
    delay: 10000,
    logger: console,
    ...opts
  }

  const delay = typeof opts.delay === 'number' ? opts.delay : undefined
  const logger =
    typeof opts.logger === 'object' || typeof opts.logger === 'function'
      ? opts.logger
      : undefined

  process.once('SIGTERM', onSignal)
  process.once('SIGINT', onSignal)
  process.once('uncaughtException', onError)
  process.once('unhandledRejection', onError)
  process.once('beforeExit', onNormalExit)

  const sleeped = Symbol('sleeped')

  return {
    close () {
      run({ manual: true })
    },
    uninstall () {
      process.removeListener('SIGTERM', onSignal)
      process.removeListener('SIGINT', onSignal)
      process.removeListener('uncaughtException', onError)
      process.removeListener('unhandledRejection', onError)
      process.removeListener('beforeExit', onNormalExit)
    }
  }

  function onSignal (signal) {
    run({ signal })
  }

  function afterFirstSignal (signal) {
    if (logger) logger.error(`second ${signal}, exiting`)
    process.exit(1)
  }

  function onError (err) {
    run({ err })
  }

  function afterFirstError (err) {
    if (logger) {
      logger.error('second error, exiting')
      logger.error(err)
    }
    process.exit(1)
  }

  function onNormalExit () {
    run({})
  }

  function exec (out) {
    const res = fn(out, done)

    if (res && typeof res.then === 'function') {
      return res
    }

    let _resolve
    let _reject

    const p = new Promise(function (resolve, reject) {
      _resolve = resolve
      _reject = reject
    })

    return p

    function done (err) {
      if (!_resolve) {
        return
      }

      if (err) {
        _reject(err)
        return
      }

      _resolve()
    }
  }

  async function run (out) {
    process.on('SIGTERM', afterFirstSignal)
    process.on('SIGINT', afterFirstSignal)
    process.on('uncaughtException', afterFirstError)
    process.on('unhandledRejection', afterFirstError)

    closeWithGrace.closing = true

    try {
      const res = await Promise.race([
        // We create the timer first as fn
        // might block the event loop
        ...(typeof delay === 'number' ? [sleep(delay, sleeped)] : []),
        exec(out)
      ])

      if (res === sleeped || out.err) {
        process.exit(1)
      } else {
        process.exit(0)
      }
    } catch (err) {
      if (logger) logger.error(err)
      process.exit(1)
    }
  }
}

module.exports = closeWithGrace
