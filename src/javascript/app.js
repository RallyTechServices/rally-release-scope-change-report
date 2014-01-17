Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    prefixes: {},
    preliminary_estimates: {},
    logger: new Rally.technicalservices.Logger(),
    items: [
        {xtype:'container',itemId:'header_box', defaults: { padding: 5, margin: 5}, layout: { type: 'hbox'}, items:[
            {xtype:'container',itemId:'release_selector_box'},
            {xtype:'container',itemId:'release_description_box', padding: 10, tpl:'<tpl>{msg}</tpl>'}
        ]},
        {xtype:'container',itemId:'change_summary_box', padding: 10, margin: 10  },
        {xtype:'container',itemId:'daily_box', padding: 10, margin: 25 },
        {xtype:'tsinfolink'}
    ],
    launch: function() {
        this.logger.log("Launched with this context ", this.getContext());
        Deft.Chain.pipeline([this._setPrefixes, this._setPreliminaryEstimates],this).then({
            scope: this,
            success: function(throw_away) {
                this._addReleaseBox();
            },
            failure: function(error) {
                alert(error);
            }
        });
    },
    _setPrefixes: function() {
        this.logger.log("_setPrefixes");
        var me = this;
        var deferred = Ext.create('Deft.Deferred');
        var pi_filter = Ext.create('Rally.data.wsapi.Filter',{property:'TypePath',operator:'contains',value:"PortfolioItem/"});
        var story_filter = Ext.create('Rally.data.wsapi.Filter',{property:'TypePath',operator:'contains',value:"Hierarchical"});
        var defect_filter = Ext.create('Rally.data.wsapi.Filter',{property:'TypePath',operator:'contains',value:"Defect"});

        var filters = pi_filter.or(story_filter.or(defect_filter));
        
        Ext.create('Rally.data.wsapi.Store',{
            model:'TypeDefinition',
            autoLoad: true,
            filters: filters,
            listeners: {
                scope: this,
                load: function(store,records,successful){
                    if ( ! successful ) {
                        deferred.reject("There was a problem finding type definitions for prefixes.");
                    } else {
                        var prefixes = {};
                        Ext.Array.each(records,function(record){
                            me.logger.log("Prefix for ", record.get('TypePath'), record.get('IDPrefix'));
                            prefixes[record.get('TypePath')] = record.get('IDPrefix');
                        });
                        this.prefixes = prefixes;
                        deferred.resolve([]);
                    }
                }
            }
        });
        return deferred;
    },
    _setPreliminaryEstimates: function() {
        this.logger.log("_setPreliminaryEstimates");
        var me = this;
        //preliminary_estimates
        var deferred = Ext.create('Deft.Deferred');
        Ext.create('Rally.data.wsapi.Store',{
            model:'PreliminaryEstimate',
            autoLoad: true,
            fetch: ['ObjectID','Value'],
            listeners: {
                scope: this,
                load: function(store,records,successful){
                    if ( ! successful ) {
                        deferred.reject("There was a problem finding values for PreliminaryEstimates.");
                    } else {
                        var estimates = {};
                        Ext.Array.each(records,function(record){
                            estimates[record.get('ObjectID')] = record.get('Value');
                        });
                        this.preliminary_estimates = estimates;
                        deferred.resolve([]);
                    }
                }
            }
        });
        return deferred;
    },
    _addReleaseBox: function() {
        this.down('#release_selector_box').add({
            xtype:'rallyreleasecombobox',
            fieldLabel: 'Release',
            labelWidth: 35,
            listeners: {
                scope: this,
                change: function(rb) {
                    this.logger.log(rb.getRecord());
                    this.down('#daily_box').removeAll();
                    this.down('#change_summary_box').removeAll();
                    this.down('#release_description_box').update(this._getReleaseSummary(rb.getRecord()));
                    this._getDailySummaries(rb.getRecord());
                }
            }
        });
    },
    _getReleaseSummary: function(release) {
        var message_wrapper = { msg: "" };
        var today = new Date();
        
        var start_js  = release.get('ReleaseStartDate');
        var start_iso = Rally.util.DateTime.toIsoString(start_js).replace(/T.*$/,"");
        var end_js    = release.get('ReleaseDate');
        var end_iso   = Rally.util.DateTime.toIsoString(end_js).replace(/T.*$/,"");
        
        var number_of_days_in_release = Rally.technicalservices.util.Utilities.daysBetween(start_js,end_js) + 1 ;
        var number_of_days_remaining_in_release = Rally.technicalservices.util.Utilities.daysBetween(today,end_js) + 1 ;
        
        var msg = start_iso + " - " + end_iso;
        if ( today < start_js ) {
            msg += " (" + number_of_days_in_release + " Days, Not Started)";
        } else if ( today > end_js ) {
            msg += " (" + number_of_days_in_release + " Days, Done)";
        } else {
            msg += " (" + number_of_days_in_release + " Days, " + number_of_days_remaining_in_release + " Days remaining)";
        }
                
        message_wrapper.msg = msg;
        return message_wrapper;
    },
    _getDailySummaries: function(release){
        this.logger.log("_getDailySummaries ",release);
        var today = new Date();
        var start_js  = release.get('ReleaseStartDate');
        var end_js    = release.get('ReleaseDate');
        
        if ( today < start_js ) {
            this.down('#change_summary_box').add({
                xtype:'container',
                html:'Release has not started yet.'
            });
        } else {
            this.release_name = release.get('Name');
            this.start_date = start_js;
            this.end_date = end_js;
            
            Deft.Chain.pipeline([this._getScopedReleases, this._getSnaps, this._processSnaps, this._makeGrid],this).then({
                scope: this,
                success: function(result) {
                    this.logger.log("Final: ",result);
                },
                failure: function(error) {
                    alert(error);
                }
            });
        }
    },
    _getScopedReleases:function(){
        var release_name = this.release_name;
        var deferred = Ext.create('Deft.Deferred');
        Ext.create('Rally.data.wsapi.Store',{
            model:'Release',
            filters: [{property:'Name',value:release_name}],
            autoLoad:true,
            listeners: {
                scope: this,
                load: function(store,records,successful){
                    if ( !successful ) {
                        deferred.reject("There was a problem finding associated Releases for " + release_name);
                    } else {
                        var oids = [];
                        Ext.Array.each(records, function(record){
                            oids.push(record.get('ObjectID'));
                        });
                        deferred.resolve(oids);
                    }
                }
            }
        });
        return deferred;
    },
    _getSnaps:function(release_oids) {
        this.logger.log("_getSnaps",release_oids);
        var deferred = Ext.create('Deft.Deferred');
        this.release_oids = release_oids;
        var start_date_iso = Rally.util.DateTime.toIsoString(this.start_date);
        var end_date_iso = Rally.util.DateTime.toIsoString(this.end_date);
        
        var type_filter = Ext.create('Rally.data.lookback.QueryFilter', {
            property: '_TypeHierarchy',
            operator: 'in',
            value: ['Defect', 'HierarchicalRequirement', 'PortfolioItem' ]
        });
        
        var date_filter = Ext.create('Rally.data.lookback.QueryFilter', {
            property: '_ValidFrom',
            operator: '>=',
            value:start_date_iso
        }).and(Ext.create('Rally.data.lookback.QueryFilter', {
            property: '_ValidFrom',
            operator: '<=',
            value:end_date_iso
        })); 
        
        var release_filter = Ext.create('Rally.data.lookback.QueryFilter', {
            property: 'Release',
            operator: 'in',
            value:release_oids
        }).or(Ext.create('Rally.data.lookback.QueryFilter', {
            property: '_PreviousValues.Release',
            operator: 'in',
            value:release_oids
        })); 
        
        var filters = type_filter.and(date_filter).and(release_filter);
        
        Ext.create('Rally.data.lookback.SnapshotStore',{
            autoLoad: true,
            filters: filters,
            fetch: ['PlanEstimate','_PreviousValues','_UnformattedID','Release','_TypeHierarchy','Name','PreliminaryEstimate'],
            hydrate: ['_TypeHierarchy','PreliminaryEstimate'],
            listeners: {
                scope: this,
                load: function(store,snaps,successful) {
                    if ( !successful ) {
                        deferred.reject("There was a problem retrieving changes");
                    } else {
                        deferred.resolve(snaps);
                    }   
                }
            }
        });
        return deferred;
    },
    _processSnaps: function(snaps){
        var me = this;
        this.logger.log("_processSnaps",snaps);
        var changes = [];
        Ext.Array.each(snaps,function(snap){
            var change_date = Rally.util.DateTime.toIsoString(Rally.util.DateTime.fromIsoString(snap.get('_ValidFrom'))).replace(/T.*$/,"");
            var previous_release = snap.get("_PreviousValues").Release;
            var release = snap.get("Release");
            var id = snap.get('_UnformattedID');
            
            var previous_size = snap.get("_PreviousValues").PlanEstimate;
            var size = snap.get("PlanEstimate") || 0;
                                    
            var type_hierarchy = snap.get('_TypeHierarchy');
            var type = type_hierarchy[type_hierarchy.length - 1 ];
            //preliminary_estimates
            if ( /Portfolio/.test(type) ) {
                size = snap.get("PreliminaryEstimate") || 0;
                me.logger.log("here",size);

                if ( size > 0 ) {
                    size = me.preliminary_estimates[size];
                }
                previous_size = snap.get("_PreviousValues").PreliminaryEstimate;
                if ( !isNaN(previous_size) ) {
                    previous_size = me.preliminary_estimates[previous_size];
                }
                me.logger.log("here",size,previous_size);
            }
            
            var size_difference = null // change was not about the size
            if ( !isNaN(previous_size) ) {
                // the value changed
                size_difference = size - previous_size;
            }
            if ( typeof previous_size != 'undefined' && previous_size == null ) {
                // change is in size and was blank before
                size_difference = size;
            }
            
            if ( typeof previous_size == 'undefined' && /Portfolio/.test(type) ) {
                // change is in size and was blank before
                size_difference = size;
            }
            
            if (size_difference) {
                changes.push({
                    FormattedID: me.prefixes[type] + id,
                    PlanEstimate: size,
                    ChangeDate: change_date,
                    ChangeValue: size_difference,
                    _type: type,
                    Name: snap.get('Name'),
                    ChangeType: 'Size Change'
                });
            } else {
                // catch the ones that were added/removed to the release
                var current_release = snap.get('Release');
                var former_release  = snap.get('_PreviousValues').Release;
                if ( typeof former_release != 'undefined' ) {
                    // undefined is not a release change!
                    me.logger.log("Release Change", id, current_release,former_release);
                    var added = false;
                    var removed = false;
                    size_difference = size;

                    var change_type = "Added to Release";
                    if (former_release == null) {
                        added = true;
                    } else {
                        if ( Ext.Array.indexOf(me.release_oids,current_release) > -1 ) {
                            added = true;
                        }
                        if ( Ext.Array.indexOf(me.release_oids,former_release) > -1 ) {
                            removed = true;
                        }
                        if ( removed ) {
                            change_type = "Removed from Release";
                            size_difference = -1 * size_difference;
                        }
                    }
                    
                    if ( ! (added && removed) ) {
                        changes.push({
                            FormattedID: me.prefixes[type] + id,
                            PlanEstimate: size,
                            ChangeDate: change_date,
                            ChangeValue: size_difference || 0,
                            _type: type,
                            Name: snap.get('Name'),
                            ChangeType: change_type
                        });
                    }
                }
            }
        });
        return changes;
    },
    _makeGrid: function(changes){
        this.logger.log("_makeGrid",changes);
        
        var store = Ext.create('Rally.data.custom.Store',{
            data: changes,
            groupField: 'ChangeDate'
        });
        
        if ( this.grid ) { this.grid.destroy(); }
        this.grid = this.down('#daily_box').add({
            xtype:'rallygrid',
            store:store,
            showPagingToolbar: false,
            features: [{
                ftype:'grouping',
                groupHeaderTpl: '{name}'
            }],
            columnCfgs: [
                {text:'id',dataIndex:'FormattedID'},
                {text:'Name',dataIndex:'Name',flex:1},
                {text:'Size',dataIndex:'PlanEstimate'},
                {text:'Delta',dataIndex:'ChangeValue'},
                {text:'Action', dataIndex:'ChangeType'}
            ]
        });
        
        return [];
    }
});
