var crypto = require('crypto')
var http = require('http')
var https = require('https')
var qs = require('querystring')

module.exports = function (Hiwu) {
  // Hide all predefined remote methods
  Hiwu.disableRemoteMethod('create', true)
  Hiwu.disableRemoteMethod('upsert', true)
  Hiwu.disableRemoteMethod('find', true)
  Hiwu.disableRemoteMethod('exists', true)
  Hiwu.disableRemoteMethod('findById', true)
  Hiwu.disableRemoteMethod('deleteById', true)
  Hiwu.disableRemoteMethod('updateAttributes', false)
  Hiwu.disableRemoteMethod('findOne', true)
  Hiwu.disableRemoteMethod('updateAll', true)
  Hiwu.disableRemoteMethod('count', true)
  Hiwu.disableRemoteMethod('createChangeStream', true)

  Hiwu.mail = function (group, obj, cb) {
    Hiwu.app.email.send({
      from: '物境未觉<no-reply@hiwu.ren>',
      to: group + '@hiwu.ren',
      subject: obj.subject,
      text: obj.content
    }, function (err) { cb(err) })
  }

  Hiwu.remoteMethod('mail', {
    description: 'Send an email to the given group',
    accepts: [
      {
        arg: 'group', type: 'string',
        http: { source: 'query' }, required: true
      },
      {
        arg: 'objet', type: 'object',
        http: { source: 'body' },
        default: JSON.stringify({ subject: '', content: '' })
      }
    ],
    returns: {
      arg: 'return', type: 'object', root: true
    }
  })

  // Global cache for Weixin
  var weixin = {
    access_token: null,
    access_token_expires_at: 0,
    jsapi_ticket: null,
    jsapi_ticket_expires_at: 0
  }

  Hiwu.updateWeixinAccessToken = function (done) {
    if (new Date().getTime() < weixin.access_token_expires_at) return done()

    https.get(
      'https://api.weixin.qq.com/cgi-bin/token?' + qs.stringify({
        appid: 'wxe927d2e4c1058daa',
        secret: '3c465fbe92a48c8e53fdec4033c8870e',
        grant_type: 'client_credential'
      }), function (res) {
      res.on('data', function (data) {
        data = JSON.parse(data)

        if (data.errcode) {
          weixin.access_token = null
          weixin.access_token_expires_at = 0
        } else {
          weixin.access_token = data.access_token
          weixin.access_token_expires_at = new Date().getTime() + 7200000
        }

        done()
      })
    }
    )
  }

  Hiwu.updateWeixinJSApiTicket = function (done) {
    if (new Date().getTime() < weixin.jsapi_ticket_expires_at) return done()

    https.get(
      'https://api.weixin.qq.com/cgi-bin/ticket/getticket?' + qs.stringify({
        access_token: weixin.access_token,
        type: 'jsapi'
      }), function (res) {
      res.on('data', function (data) {
        data = JSON.parse(data)

        if (data.errcode > 0) {
          weixin.jsapi_ticket = null
          weixin.jsapi_ticket_expires_at = 0
        } else {
          weixin.jsapi_ticket = data.ticket
          weixin.jsapi_ticket_expires_at = new Date().getTime() + 7200000
        }

        done()
      })
    }
    )
  }

  Hiwu.jweixinSignature = function (url, cb) {
    if (Hiwu.app.get('env') === 'production') {
      Hiwu.updateWeixinAccessToken(function () {
        Hiwu.updateWeixinJSApiTicket(function () {
          var res = {
            appId: 'wxe927d2e4c1058daa',
            timestamp: new Date().getTime(),
            nonceStr: Math.random().toString(36).split('.')[1]
          }

          res.signature = 'jsapi_ticket=' + weixin.jsapi_ticket + '&noncestr=' + res.nonceStr + '&timestamp=' + res.timestamp + '&url=' + url
          res.signature = crypto.createHash('sha1').update(res.signature).digest('hex')

          cb(null, res)
        })
      })
    } else {
      http.get(
        'http://hiwu.ren/api/Hiwu/jweixinSignature?' + qs.stringify({
          url: url
        }), function (res) {
        res.on('data', function (data) { cb(null, JSON.parse(data)) })
      }
      )
    }
  }

  Hiwu.remoteMethod('jweixinSignature', {
    description: 'Get Weixin access_token and jsapi_ticket',
    accepts: [
      {
        arg: 'url', type: 'string',
        http: {source: 'query'}, required: true
      }
    ],
    returns: {
      arg: 'return', type: 'object', root: true
    },
    http: {verb: 'get'}
  })
}
