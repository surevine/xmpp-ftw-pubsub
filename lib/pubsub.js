'use strict';

var builder    = require('ltx')
  , Base       = require('xmpp-ftw').Base
  , dataForm   = require('xmpp-ftw').utils['xep-0004']
  , rsm        = require('xmpp-ftw').utils['xep-0059']
  , sio          = require('xmpp-ftw').utils['xep-0258']

var PubSub = function() {}

PubSub.prototype = new Base()

PubSub.prototype.NS_PUBSUB      = 'http://jabber.org/protocol/pubsub'
PubSub.prototype.NS_SUB_OPTIONS = 'http://jabber.org/protocol/pubsub#subscribe_options'

PubSub.prototype.NS_OWNER       = 'http://jabber.org/protocol/pubsub#owner'
PubSub.prototype.NS_CONFIG      = 'http://jabber.org/protocol/pubsub#node_config'
PubSub.prototype.NS_EVENT       = 'http://jabber.org/protocol/pubsub#event'
PubSub.prototype.NS_HEADERS     = 'http://jabber.org/protocol/shim'

PubSub.prototype.NS_PUBLISH_OPTIONS = 'http://jabber.org/protocol/pubsub#publish-options'
PubSub.prototype.NS_SUBSCRIBE_AUTHORISATION =
    'http://jabber.org/protocol/pubsub#subscribe_authorization'

PubSub.prototype._events = {
    'xmpp.pubsub.create': 'createNode',
    'xmpp.pubsub.delete': 'deleteNode',
    'xmpp.pubsub.subscribe': 'subscribe',
    'xmpp.pubsub.unsubscribe': 'unsubscribe',
    'xmpp.pubsub.subscription': 'setSubscription',
    'xmpp.pubsub.subscription.config.get': 'subscriptionConfigurationGet',
    'xmpp.pubsub.subscription.config.default': 'subscriptionDefaultConfigurationGet',
    'xmpp.pubsub.subscription.config.set': 'subscriptionConfigurationSet',
    'xmpp.pubsub.publish': 'publish',
    'xmpp.pubsub.item.delete': 'deleteItem',
    'xmpp.pubsub.config.get': 'getNodeConfiguration',
    'xmpp.pubsub.config.set': 'setNodeConfiguration',
    'xmpp.pubsub.retrieve': 'getItems',
    'xmpp.pubsub.affiliations': 'getAffiliations',
    'xmpp.pubsub.affiliation': 'setAffiliation',
    'xmpp.pubsub.subscriptions': 'getSubscriptions',
    'xmpp.pubsub.purge': 'purgeNode'
}

PubSub.prototype.handles = function(stanza) {
    if (stanza.is('message') &&
        (!!stanza.getChild('event', this.NS_EVENT))) return true
    var field, value, x
    return (stanza.is('message') &&
        !!(x = stanza.getChild('x')) &&
        !!(field = x.getChildByAttr('type', 'hidden')) &&
        !!(value = field.getChild('value')) &&
        (this.NS_SUBSCRIBE_AUTHORISATION === value.getText()))
}

PubSub.prototype.handle = function(stanza) {
    if (!!stanza.getChild('event', this.NS_EVENT))
        return this._eventNotification(stanza)
    return this._handleSubscriptionAuthorisation(stanza)
}

PubSub.prototype.createNode = function(data, callback) {
    if (typeof callback !== 'function')
        return this._clientError('Missing callback', data)
    if (!data.to) return this._clientError('Missing \'to\' key', data, callback)
    if (!data.node)
        return this._clientError('Missing \'node\' key', data, callback)

    var self   = this
    var stanza = this._getStanza(data, 'set', 'create')
    if (data.options) {
        try {
            dataForm.addForm(
                stanza.root().getChild('pubsub').c('configure'),
                data.options,
                this.NS_CONFIG
            )
        } catch(e) {
            return this._clientError(
                'Badly formatted data form', data, callback
            )
        }
    }
    this.manager.trackId(stanza, function(stanza) {
        if (stanza.attrs.type === 'error')
            return callback(self._parseError(stanza))
        callback(null, true)
    })
    this.client.send(stanza)
}

PubSub.prototype.deleteNode = function(data, callback) {
    if (typeof callback !== 'function')
        return this._clientError('Missing callback', data)
    if (!data.to) return this._clientError('Missing \'to\' key', data, callback)
    if (!data.node)
        return this._clientError('Missing \'node\' key', data, callback)

    var self = this
    var stanza = this._getStanza(data, 'set', 'delete')
    if (data.redirect)
        stanza.c('redirect', { uri: data.redirect })

    this.manager.trackId(stanza, function(stanza) {
        if ('error' === stanza.attrs.type)
            return callback(self._parseError(stanza), null)
        callback(null, true)
    })
    this.client.send(stanza)
}

PubSub.prototype.subscribe = function(data, callback) {
    if (typeof callback !== 'function')
        return this._clientError('Missing callback', data)
    if (!data.to) return this._clientError('Missing \'to\' key', data, callback)
    if (!data.node)
        return this._clientError('Missing \'node\' key', data, callback)

    if (!data.jid) data.jid = this.manager.getJidType('bare')

    var self   = this
    var stanza = this._getStanza(data, 'set', 'subscribe')

    this.manager.trackId(stanza, function(stanza) {
        if (stanza.attrs.type === 'error')
            return callback(self._parseError(stanza), null)
        var subscription = stanza.getChild('pubsub').getChild('subscription')
        var details = { subscription: subscription.attrs.subscription }
        var options
        if (!!(options = subscription.getChild('subscribe-options')))
            details.configuration = {
                required: (!!options.getChild('required'))
            }
        if (subscription.attrs.subid) details.id = subscription.attrs.subid
        callback(null, details)
    })
    this.client.send(stanza)
}

PubSub.prototype.unsubscribe = function(data, callback) {
    if (typeof callback !== 'function')
        return this._clientError('Missing callback', data)
    if (!data.to) return this._clientError('Missing \'to\' key', data, callback)
    if (!data.node)
        return this._clientError('Missing \'node\' key', data, callback)
    if (!data.jid) data.jid = this.manager.getJidType('bare')

    var self   = this
    var stanza = this._getStanza(data, 'set', 'unsubscribe')
    this.manager.trackId(stanza, function(stanza) {
        if (stanza.attrs.type === 'error')
            return callback(self._parseError(stanza), null)
        callback(null, true)
    })
    this.client.send(stanza)
}

PubSub.prototype.setSubscription = function(data, callback) {
    if (typeof callback !== 'function')
        return this._clientError('Missing callback', data)
    if (!data.to) return this._clientError('Missing \'to\' key', data, callback)
    if (!data.node)
        return this._clientError('Missing \'node\' key', data, callback)
    if (!data.jid)
        return this._clientError('Missing \'jid\' key', data, callback)
    if (!data.subscription)
        return this._clientError('Missing \'subscription\' key', data, callback)

    var self   = this
    var stanza = this._getStanza(
      { to: data.to, node: data.node }, 'set', 'subscriptions', this.NS_OWNER
    )
    stanza.c(
        'subscription',
        { jid: data.jid, subscription: data.subscription }
    )

    this.manager.trackId(stanza, function(stanza) {
        if ('error' === stanza.attrs.type)
            return callback(self._parseError(stanza), null)
        callback(null, true)
    })
    this.client.send(stanza)
}

PubSub.prototype.subscriptionConfigurationGet = function(data, callback) {
    if (typeof callback !== 'function')
        return this._clientError('Missing callback', data)
    if (!data.to) return this._clientError('Missing \'to\' key', data, callback)
    if (!data.node)
        return this._clientError('Missing \'node\' key', data, callback)
    if (!data.jid) data.jid = this.manager.jid

    var self   = this
    var stanza = this._getStanza(data, 'get', 'options')

    this.manager.trackId(stanza, function(stanza) {
        if (stanza.attrs.type === 'error')
            return callback(self._parseError(stanza), null)
        var data = dataForm.parseFields(
            stanza.getChild('pubsub').getChild('options').getChild('x')
        )
        callback(null, data)
    })
    this.client.send(stanza)
}

PubSub.prototype.subscriptionDefaultConfigurationGet = function(data, callback) {
    if (typeof callback !== 'function')
        return this._clientError('Missing callback', data)
    if (!data.to)
        return this._clientError('Missing \'to\' key', data, callback)

    var self   = this
    var stanza = this._getStanza(data, 'get', 'default')

    this.manager.trackId(stanza, function(stanza) {
        if (stanza.attrs.type === 'error')
            return callback(self._parseError(stanza), null)
        var data = dataForm.parseFields(
            stanza.getChild('pubsub').getChild('default').getChild('x')
        )
        callback(null, data)
    })
    this.client.send(stanza)
}

PubSub.prototype.subscriptionConfigurationSet = function(data, callback) {
    if (typeof callback !== 'function')
        return this._clientError('Missing callback', data)
    if (!data.to) return this._clientError('Missing \'to\' key', data, callback)
    if (!data.node)
        return this._clientError('Missing \'node\' key', data, callback)
    if (!data.jid) data.jid = this.manager.jid
    if (!data.form)
        return this._clientError('Missing \'form\' key', data, callback)

    var self   = this
    var stanza = this._getStanza(data, 'set', 'options')
    try {
        dataForm.addForm(stanza, data.form, this.NS_SUB_OPTIONS, 'form')
    } catch(e) {
        return this._clientError('Badly formatted data form', data, callback)
    }
    this.manager.trackId(stanza, function(stanza) {
        if (stanza.attrs.type === 'error')
            return callback(self._parseError(stanza), null)
        callback(null, true)
    })
    this.client.send(stanza)
}

PubSub.prototype.publish = function(data, callback) {
    if (typeof callback !== 'function')
        return this._clientError('Missing callback', data)
    if (!data.to) return this._clientError('Missing \'to\' key', data, callback)
    if (!data.node)
        return this._clientError('Missing \'node\' key', data, callback)
    if (!data.content || (0 === data.content.toString().length))
        return this._clientError('Missing message content', data, callback)
    if (!data.jid) data.jid = this.manager.jid

    var self    = this
    var stanza  = this._getStanza(data, 'set', 'publish')
    var details = data.id ? { id: data.id } : {}
    try {
        var item = stanza.c('item', details)
        this._getItemParser().build(data.content, item)
    } catch (e) {
        return this._clientError(
            'Could not parse content to stanza', data, callback
        )
    }
    if (data.options) {
        var options = stanza.root().getChild('pubsub').c('publish-options')
        try {
            dataForm.addForm(options, data.options, this.NS_PUBLISH_OPTIONS)
        } catch(e) {
            return this._clientError(
                'Badly formatted data form', data, callback
            )
        }
    }
    this.manager.trackId(stanza, function(stanza) {
        if (stanza.attrs.type === 'error')
            return callback(self._parseError(stanza), null)
        callback(null, {
            id: stanza.getChild('pubsub').getChild('publish').getChild('item').attrs.id
        })
    })
    this.client.send(stanza)
}

PubSub.prototype.deleteItem = function(data, callback) {
    if (typeof callback !== 'function')
        return this._clientError('Missing callback', data)
    if (!data.to) return this._clientError('Missing \'to\' key', data, callback)
    if (!data.node)
        return this._clientError('Missing \'node\' key', data, callback)
    if (!data.id) return this._clientError('Missing \'id\' key', data, callback)

    var self    = this
    var stanza  = this._getStanza(data, 'set', 'retract')
    stanza.c('item', { id: data.id })
    this.manager.trackId(stanza, function(stanza) {
        if (stanza.attrs.type === 'error')
            return callback(self._parseError(stanza), null)
        callback(null, true)
    })
    this.client.send(stanza)
}

PubSub.prototype.purgeNode = function(data, callback) {
    if (typeof callback !== 'function')
        return this._clientError('Missing callback', data)
    if (!data.to) return this._clientError('Missing \'to\' key', data, callback)
    if (!data.node)
        return this._clientError('Missing \'node\' key', data, callback)

    var self    = this
    var stanza  = this._getStanza(data, 'set', 'purge')
    this.manager.trackId(stanza, function(stanza) {
        if (stanza.attrs.type === 'error')
            return callback(self._parseError(stanza), null)
        callback(null, true)
    })
    this.client.send(stanza)
}

PubSub.prototype.getNodeConfiguration = function(data, callback) {
    if (typeof callback !== 'function')
        return this._clientError('Missing callback', data)
    if (!data.to) return this._clientError('Missing \'to\' key', data, callback)
    if (!data.node)
        return this._clientError('Missing \'node\' key', data, callback)

    var self = this
    var stanza = this._getStanza(data, 'get', 'configure', this.NS_OWNER)
    this.manager.trackId(stanza, function(stanza) {
        if ('error' === stanza.attrs.type)
            return callback(self._parseError(stanza), null)
        var data = dataForm.parseFields(
            stanza.getChild('pubsub').getChild('configure').getChild('x')
        )
        callback(null, data)
    })
    this.client.send(stanza)
}

PubSub.prototype.setNodeConfiguration = function(data, callback) {
    if (typeof callback !== 'function')
        return this._clientError('Missing callback', data)
    if (!data.to)
        return this._clientError('Missing \'to\' key', data, callback)
    if (!data.node)
        return this._clientError('Missing \'node\' key', data, callback)
    if (!data.form)
        return this._clientError('Missing \'form\' key', data, callback)

    var self = this
    var stanza = this._getStanza(data, 'set', 'configure', this.NS_OWNER)
    try {
        dataForm.addForm(stanza, data.form, this.NS_CONFIG)
    } catch(e) {
        return this._clientError('Badly formatted data form', data, callback)
    }
    this.manager.trackId(stanza, function(stanza) {
        if ('error' === stanza.attrs.type)
            return callback(self._parseError(stanza), null)
        callback(null, true)
    })
    this.client.send(stanza)
}

PubSub.prototype.getItems = function(data, callback) {
    var stanza = this._getItemsStanza(data, callback)
    if (!stanza) {
        return
    }
    var self = this
    this.manager.trackId(stanza, function(stanza) {
        if (stanza.attrs.type === 'error')
            return callback(self._parseError(stanza), null)
        var items = []
        stanza.getChild('pubsub')
            .getChild('items')
            .getChildren('item').forEach(function(entry) {

            var item = {
                id: entry.attrs.id,
                entry: self._getItemParser().parse(entry)
            }
            if (entry.attrs.publisher) {
                item.publisher = entry.attrs.publisher
            }
            sio.parse(entry, item)
            items.push(item)
        }, this)
        var paging = rsm.parse(stanza.getChild('pubsub'))
        callback(null, items, paging)
    })

    this.client.send(stanza)
}

PubSub.prototype._getItemsStanza = function(data, callback) {
    if (typeof callback !== 'function')
        return this._clientError('Missing callback', data)
    if (!data.to) return this._clientError('Missing \'to\' key', data, callback)
    if (!data.node)
        return this._clientError('Missing \'node\' key', data, callback)
    var attrs = { to: data.to, node: data.node }
    if (data.maxItems) attrs.maxItems = data.maxItems
    var stanza = this._getStanza(
        attrs, 'get', 'items', this.NS_PUBSUB
    )

    if (!this._addItemIds(data, stanza)) {
        return this._clientError(
            'ID should be string or array of strings', data, callback
        )
    }
    if (data.rsm) rsm.build(stanza.root().getChild('pubsub'), data.rsm)
    return stanza
}

PubSub.prototype._addItemIds = function(data, stanza) {
    if (!data.id) {
        return true
    }
    var itemIds = data.id
    if (false === (data.id instanceof Array)) itemIds = [ data.id ]
    var error = false
    itemIds.some(function(id) {
        if ((typeof id !== 'string') &&
            (typeof id !== 'number')) {
            error = true
            return true
        }
        stanza.c('item', { id: id }).up()
    })
    return !error
}

PubSub.prototype.getAffiliations = function(data, callback) {
    if (typeof callback !== 'function')
        return this._clientError('Missing callback', data)
    if (!data.to) return this._clientError('Missing \'to\' key', data, callback)
    if (data.owner && !data.node)
        return this._clientError('Can only do \'owner\' for a node', data, callback)
    var owner = (data.owner) ? this.NS_OWNER : null
    var self = this
    var stanza = this._getStanza(data, 'get', 'affiliations', owner)
    if (data.rsm) rsm.build(stanza.root().getChild('pubsub'), data.rsm)
    if (false === this._getAffiliations(stanza, data, callback)) return
    this.manager.trackId(stanza, function(stanza) {
        if (stanza.attrs.type === 'error')
            return callback(self._parseError(stanza), null)
        var affiliations = []
        stanza.getChild('pubsub')
            .getChild('affiliations')
            .getChildren('affiliation').forEach(function(affiliation) {
            var aff = {
                node: affiliation.attrs.node,
                affiliation: affiliation.attrs.affiliation
            }
            if (affiliation.attrs.jid)
                aff.jid = self._getJid(affiliation.attrs.jid)
            affiliations.push(aff)
        })
        var paging = rsm.parse(stanza.getChild('pubsub'))
        callback(null, affiliations, paging)
    })
    this.client.send(stanza)
}

PubSub.prototype._getAffiliations = function() {
    return true
}

PubSub.prototype.setAffiliation = function(data, callback) {
    if (typeof callback !== 'function')
        return this._clientError('Missing callback', data)
    if (!data.to)
        return this._clientError('Missing \'to\' key', data, callback)
    if (!data.node)
        return this._clientError('Missing \'node\' key', data, callback)
    if (!data.jid)
        return this._clientError('Missing \'jid\' key', data, callback)
    if (!data.affiliation)
        return this._clientError('Missing \'affiliation\' key', data, callback)
    var self = this
    var stanza = this._getStanza(data, 'set', 'affiliations', this.NS_OWNER)
    var detail = { jid: data.jid }
    if (data.affiliation) detail.affiliation = data.affiliation
    stanza.c('affiliation', detail)
    this.manager.trackId(stanza, function(stanza) {
        if ('error' === stanza.attrs.type)
            return callback(self._parseError(stanza), null)
        callback(null, true)
    })
    this.client.send(stanza)
}

PubSub.prototype.getSubscriptions = function(data, callback) {
    if (typeof callback !== 'function') {
        return this._clientError('Missing callback', data)
    }
    if (!data.to) return this._clientError('Missing \'to\' key', data, callback)
    if (data.owner && !data.node) {
        return this._clientError(
            'Can only do \'owner\' for a node', data, callback
        )
    }
    var owner = (data.owner) ? this.NS_OWNER : null
    var self = this
    var stanza = this._getStanza(data, 'get', 'subscriptions', owner)
    if (data.rsm) rsm.build(stanza.root().getChild('pubsub'), data.rsm)
    if (false === this._getSubscriptions(stanza, data, callback)) return
    this.manager.trackId(stanza, function(stanza) {
        if (stanza.attrs.type === 'error')
            return callback(self._parseError(stanza), null)
        var subscriptions = []
        stanza.getChild('pubsub')
            .getChild('subscriptions')
            .children.forEach(function(subscription) {
            subscriptions.push(this._getSubscription(subscription))
        }, self)
        var paging = rsm.parse(stanza.getChild('pubsub'))
        callback(null, subscriptions, paging)
    })
    this.client.send(stanza)
}

PubSub.prototype._getSubscriptions = function() {
    return true
}

PubSub.prototype._getSubscription = function(subscription) {
    var sub = {
        subscription: subscription.attrs.subscription,
    }
    if (subscription.attrs.jid) sub.jid = this._getJid(subscription.attrs.jid)
    if (subscription.attrs.node) sub.node = subscription.attrs.node
    if (subscription.attrs.subid) sub.id = subscription.attrs.subid
    return sub
}

PubSub.prototype._getStanza = function(data, type, element, namespace) {
    var attributes = {}
    if (data.node) attributes.node = data.node
    if (data.jid) attributes.jid = data.jid
    if (data.id) attributes.subid = data.id
    /* jshint -W106 */
    if (data.maxItems) attributes.max_items = data.maxItems
    return new builder.Element(
        'iq',
        { to: data.to, type: type, id: this._getId() }
    ).c('pubsub', {xmlns: namespace || this.NS_PUBSUB})
     .c(element, attributes)
}

PubSub.prototype._getItemParser = function() {
    if (!this.itemParser) {
        this.itemParser = require('xmpp-ftw-item-parser')
        this.itemParser.setLogger(this.manager._getLogger())
    }
    return this.itemParser
}

PubSub.prototype.setItemParser = function(parser) {
    this.itemParser = parser
    return this
}

PubSub.prototype._eventNotification = function(stanza) {
    var items, subscription, affiliations, configuration, del, purge
    var event = stanza.getChild('event', this.NS_EVENT)
    if (!!(items = event.getChild('items'))) {
        if (items.getChild('item'))
            return this._itemNotification(stanza, items)
        if (items.getChild('retract'))
            return this._itemDeleteNotification(stanza, items)
    }
    if (!!(subscription = event.getChild('subscription')))
        return this._subscriptionUpdate(stanza, subscription)
    if (!!(affiliations = event.getChild('affiliations')))
        return this._affiliationUpdate(stanza, affiliations)
    if (!!(configuration = event.getChild('configuration')))
        return this._configurationUpdate(stanza, configuration)
    if (!!(del = event.getChild('delete')))
        return this._deleteNodeNotification(stanza, del)
    if (!!(purge = event.getChild('purge')))
        return this._purgeNodeNotification(stanza, purge)
    return false
}

PubSub.prototype._configurationUpdate = function(stanza, configuration) {
    var data = { from: stanza.attrs.from }
    this._getConfigurationChanges(configuration, data)
    this.socket.send('xmpp.pubsub.push.configuration', data)
    return true
}

PubSub.prototype._getConfigurationChanges = function(configuration, data) {
    data.node = configuration.attrs.node
    var x
    if (!!(x = configuration.getChild('x', dataForm.NS)))
        data.configuration = dataForm.parseFields(x)
}

PubSub.prototype._subscriptionUpdate = function(stanza, subscription) {
    var data = { from: stanza.attrs.from }
    this._getSubscriptionUpdate(subscription, data)
    this.socket.send('xmpp.pubsub.push.subscription', data)
    return true
}

PubSub.prototype._getSubscriptionUpdate = function(subscription, data) {
    data.node = subscription.attrs.node
    data.subscription = subscription.attrs.subscription
    if (subscription.attrs.jid)
        data.jid = this._getJid(subscription.attrs.jid)
}

PubSub.prototype._affiliationUpdate = function(stanza, affiliations) {
    var data = { from: stanza.attrs.from }
    this._getAffiliationUpdate(affiliations, data)
    this.socket.send('xmpp.pubsub.push.affiliation', data)
    return true
}

PubSub.prototype._getAffiliationUpdate = function(affiliations, data) {
    var affiliation = affiliations.getChild('affiliation')
    data.node = affiliations.attrs.node
    data.affiliation = affiliation.attrs.affiliation
    if (affiliation.attrs.jid)
        data.jid = this._getJid(affiliation.attrs.jid)
}

PubSub.prototype._deleteNodeNotification = function(stanza, del) {
    var data = { from: stanza.attrs.from }
    this._getDeleteNodeNotification(del, data)
    this.socket.send('xmpp.pubsub.push.delete', data)
    return true
}

PubSub.prototype._getDeleteNodeNotification = function(del, data) {
    data.node = del.attrs.node
    var redirect
    if (!!(redirect = del.getChild('redirect')))
        data.redirect = redirect.attrs.uri
}

PubSub.prototype._itemDeleteNotification = function(stanza, items) {
    var data = { from: stanza.attrs.from }
    this._getItemData(items, data, 'retract')
    this._getHeaderData(stanza, data)
    this.socket.send('xmpp.pubsub.push.retract', data)
    return true
}

PubSub.prototype._itemNotification = function(stanza, items) {
    var data = { from: stanza.attrs.from }
    this._getItemData(items, data)
    if (stanza.getChild('headers'))
        this._getHeaderData(stanza, data)
    if (stanza.getChild('delay'))
        data.delay = stanza.getChild('delay').attrs.stamp
    sio.parse(stanza, data)
    this.socket.send('xmpp.pubsub.push.item', data)
    return true
}

PubSub.prototype._purgeNodeNotification = function(stanza, purge) {
    var data = { from: stanza.attrs.from, node: purge.attrs.node }
    this.socket.send('xmpp.pubsub.push.purge', data)
    return true
}

PubSub.prototype._getHeaderData = function(stanza, data) {
    var headers
    if (!(headers = stanza.getChild('headers', this.NS_HEADERS))) return
    data.headers = []
    headers.children.forEach(function(header) {
        data.headers.push({name: header.attrs.name, value: header.getText() })
    })
}

PubSub.prototype._getItemData = function(items, data, type) {
    data.node = items.attrs.node
    var item
    if (!(item = items.getChild(type || 'item'))) return false
    data.id = item.attrs.id
    if (item.attrs.publisher)
        data.publisher = this._getJid(item.attrs.publisher)
    if (item.children.length > 0)
        data.entry = this._getItemParser().parse(item)
}

PubSub.prototype._handleSubscriptionAuthorisation = function(stanza) {
    var data = { from: stanza.attrs.from, id: stanza.attrs.id }
    this._handleAuthorisationRequest(data, stanza)
}

PubSub.prototype._handleAuthorisationRequest = function(data, stanza, event) {
    var to = stanza.attrs.from
    var id = stanza.attrs.id
    var self = this
    data.form = dataForm.parseFields(stanza.getChild('x'))
    this.socket.send(
      event || 'xmpp.pubsub.push.authorisation',
      data,
      function(data) {
        var stanza = new builder.Element(
            'message',
            { to: to, id: id }
        )
        try {
            dataForm.addForm(stanza, data, self.NS_SUBSCRIBE_AUTHORISATION)
        } catch(e) {
            return self._clientError('Badly formatted data form', data)
        }
        self.client.send(stanza)
    })
}

module.exports = PubSub
