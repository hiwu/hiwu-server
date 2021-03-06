var async = require('async')
var crypto = require('crypto')
var fs = require('fs')
var loopback = require('loopback')
var multiparty = require('multiparty')

module.exports = function (Item) {
  // Wrap the built-in `create` method to add userId attribute
  // Refer to the example in "Change the implementation of built-in methods"
  // http://docs.strongloop.com/display/public/LB/Customizing+models
  Item.on('dataSourceAttached', function (obj) {
    var create = Item.create
    Item.create = function (data, options, cb) {
      data.userId = loopback.getCurrentContext().get('accessToken').userId
      create.apply(Item, [data, options, cb])
    }
  })

  Item.prototype.publicView = function (cb) {
    if (this.public) {
      Item.findById(this.id, {
        include: ['hiwuUser', 'photos', {'comments': ['hiwuUser', 'toUser']}]
      }, function (err, item) {
        if (err) return cb(err)

        async.parallel([
          function (cb) {
            item.__count__likers(function (err, count) {
              item.likes = count
              cb(err, count)
            })
          },
          function (cb) {
            if (loopback.getCurrentContext().get('accessToken') === undefined) {
              cb(null)
            } else {
              item.__exists__likers(
                loopback.getCurrentContext().get('accessToken').userId,
                function (err, liked) {
                  item.liked = liked
                  cb(err, liked)
                }
              )
            }
          }
        ], function (err, results) {
          cb(err, item)
        })
      })
    } else {
      var err = new Error('the model you visited is private')
      err.statusCode = 404
      err.code = 'PRIVATE_MODEL_VISITED'
      cb(err)
    }
  }

  Item.remoteMethod(
    'publicView',
    {
      description: 'View a public item.',
      returns: {arg: 'item', type: 'Item', root: true},
      http: {verb: 'get'},
      isStatic: false
    }
  )

  // Cancel the built-in `__create__photos` method
  Item.disableRemoteMethod('__create__photos', false)

  Item.prototype.createPhoto = function (req, cb) {
    var self = this

    new multiparty.Form().parse(req, function (err, data, files) {
      if (err) return cb(err)

      data.itemId = self.id
      Item.app.models.Photo.create(data, function (err, photo) {
        if (err) return cb(err)

        var oss = Item.app.aliyun.oss
        var file = files.data[0]
        var body = fs.readFileSync(file.path)
        var hash = crypto.createHash('md5').update(body).digest('hex')
        var name = photo.id + '_' + hash

        // Save the image
        oss.putObject({
          Bucket: 'hiwu',
          Key: oss.makeKey('photo', name),
          Body: body,
          ContentType: file.headers['content-type']
        }, function (err, data) {
          if (err) {
            console.log('Failed to upload to Aliyun OSS:', err)
          }

          // Cleanup after uploading
          for (var i in files) {
            for (var j in files[i]) {
              fs.unlink(files[i][j].path, function (err) {
                if (err) throw err
              })
            }
          }
        })

        // Update the url
        photo.updateAttribute('url', oss.makeImgUrl('photo', name), cb)
      })
    })
  }

  Item.remoteMethod(
    'createPhoto',
    {
      description: 'Upload a new photo to this item.',
      accepts: {arg: 'req', type: 'object', http: { source: 'req' }},
      returns: {arg: 'photo', type: 'Photo', root: true},
      http: {verb: 'post', path: '/photos'},
      isStatic: false
    }
  )
}
