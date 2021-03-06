var oneapm = require('oneapm')
var loopback = require('loopback')
var boot = require('loopback-boot')

var app = module.exports = loopback()

// Setup the view render
app.locals.oneapm = oneapm
app.set('views', './client/dist')
app.set('view engine', 'ejs')

app.start = function () {
  // Start the web server
  return app.listen(function () {
    app.emit('started')
    console.log('Environment: %s', app.get('env'))

    var baseUrl = app.get('url').replace(/\/$/, '')
    console.log('Web server listening at: %s', baseUrl)

    if (app.get('loopback-component-explorer')) {
      var explorerPath = app.get('loopback-component-explorer').mountPath
      console.log('Browse your REST API at %s%s', baseUrl, explorerPath)
    }
  })
}

// Bootstrap the application, configure models, datasources and middleware.
// Sub-apps like REST API are mounted via boot scripts.
boot(app, { appRootDir: __dirname }, function (err) {
  if (err) throw err

  // start the server if `$ node server.js`
  if (require.main === module) {
    app.start()
  }
})
