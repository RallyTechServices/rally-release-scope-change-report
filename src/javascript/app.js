Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    prefixes: {},
    preliminary_estimates: {},
    show_types: ['PortfolioItem'],
/*    show_types: ['HierarchicalRequirement','Defect','PortfolioItem'], */
    alternate_pi_size_field: 'c_PIPlanEstimate',
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
                    this.setLoading();
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
            this.setLoading(false);
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
        var me = this;
        this.logger.log("_getSnaps",release_oids,release_oids.length);
        var deferred = Ext.create('Deft.Deferred');
        this.release_oids = release_oids;

        var page_size = 2;
        var total_count = release_oids.length;
        var start_index = 0;
        
        // divide up the calls because there's a limit to how many characters
        // we can put onto a GET
        var promises = [];
        while ( start_index < total_count ) {
            var oids_subset = Ext.Array.slice(release_oids,start_index,start_index+page_size);
            promises.push(this._getSnapsForSubset(oids_subset));
            start_index = start_index + page_size;
        }
        
        Deft.Promise.all(promises).then({
            scope: this,
            success: function(records) {
                var snaps = [];
                Ext.Array.each(records,function(record_collection){
                    Ext.Array.push(snaps,record_collection);
                });
                deferred.resolve(snaps);
            },
            failure: function(error) {
                deferred.reject(error);
            }
        });
            
        return deferred;
    },
    _getSnapsForSubset:function(release_oids) {
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        this.logger.log("_getSnapsForSubset",release_oids,release_oids.length);
        var start_date_iso = Rally.util.DateTime.toIsoString(this.start_date);
        var end_date_iso = Rally.util.DateTime.toIsoString(this.end_date);
        
        var type_filter = Ext.create('Rally.data.lookback.QueryFilter', {
            property: '_TypeHierarchy',
            operator: 'in',
            value: this.show_types
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
        
        var incoming_release_change_filter = Ext.create('Rally.data.lookback.QueryFilter', {
            property: 'Release',
            operator: 'in',
            value:release_oids
        }).and(Ext.create('Rally.data.lookback.QueryFilter', {
            property: '_PreviousValues.Release',
            operator: 'exists',
            value:true
        }));
        
        var outgoing_release_change_filter = Ext.create('Rally.data.lookback.QueryFilter', {
            property: '_PreviousValues.Release',
            operator: 'in',
            value:release_oids
        });
        
        var size_change_filter = Ext.create('Rally.data.lookback.QueryFilter',{
            property: '_PreviousValues.' + this.alternate_pi_size_field,
            operator: 'exists',
            value: true
        });
        
        var type_change_filter = incoming_release_change_filter.or(outgoing_release_change_filter.or(size_change_filter));
        
        var filters = type_filter.and(date_filter).and(release_filter).and(type_change_filter);
        
        Ext.create('Rally.data.lookback.SnapshotStore',{
            autoLoad: true,
            filters: filters,
            fetch: ['PlanEstimate','_PreviousValues','_UnformattedID','Release','_TypeHierarchy','Name','PreliminaryEstimate',this.alternate_pi_size_field],
            hydrate: ['_TypeHierarchy'],
            listeners: {
                scope: this,
                load: function(store,snaps,successful) {
                    if ( !successful ) {
                        deferred.reject("There was a problem retrieving changes");
                    } else {
                        me.logger.log("Back for ",release_oids);
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
            var id = me._getIdFromSnap(snap);
            
            var previous_size = snap.get("_PreviousValues")[me.alternate_pi_size_field];
            var size = snap.get(me.alternate_pi_size_field) || 0;
                                  
            var type_hierarchy = snap.get('_TypeHierarchy');
            var type = type_hierarchy[type_hierarchy.length - 1 ];
            
            var change_type = me._getChangeTypeFromSnap(snap);
          
            var size_difference = size;
            if ( change_type === "Size Change" ) {
                size_difference = size - previous_size;
            }
            if ( change_type === "Removed from Release" ) {
                size_difference = -1 * size_difference;
            }
            
            if ( change_type ) {
                changes.push({
                    FormattedID: id,
                    PlanEstimate: size,
                    ChangeDate: change_date,
                    ChangeValue: size_difference,
                    _type: type,
                    Name: snap.get('Name'),
                    ChangeType: change_type,
                    timestamp: snap.get('_ValidFrom'),
                    id: id + '' + snap.get('_ValidFrom')
                });
            }
        });
        return changes;
    },
    _getIdFromSnap: function(snap){
        var type_hierarchy = snap.get('_TypeHierarchy');
        var type = type_hierarchy[type_hierarchy.length - 1 ];
        return this.prefixes[type] + snap.get('_UnformattedID');
    },
    _getChangeTypeFromSnap: function(snap){
        var change_type = false;
        
        var previous_release = snap.get("_PreviousValues").Release;
        var release = snap.get("Release");
        
        var type_hierarchy = snap.get('_TypeHierarchy');
        var type = type_hierarchy[type_hierarchy.length - 1 ];
        var id = this._getIdFromSnap(snap);
        
        var previous_size = snap.get("_PreviousValues").PlanEstimate;
        var size = snap.get("PlanEstimate") || 0;
                   
        if ( previous_release === null && Ext.Array.indexOf(this.release_oids,release) > -1 ) {
            change_type = "Added to Release";
        } else if ( Ext.Array.indexOf(this.release_oids,release) > -1 && Ext.Array.indexOf(this.release_oids,previous_release) === -1 ) {
            change_type = "Added to Release";
        } else if ( release === "" && typeof previous_size !== "undefined") {
            change_type = "Removed from Release";
        } else if ( size !== previous_size && typeof previous_size !== "undefined") {
            change_type = "Size Change";
        }
        
        var change_date = Rally.util.DateTime.toIsoString(Rally.util.DateTime.fromIsoString(snap.get('_ValidFrom')));
        this.logger.log(id, change_date, change_type, snap);
        return change_type;
    },
    _makeGrid: function(changes){
        this.logger.log("_makeGrid",changes);
        this.setLoading(false);
        var store = Ext.create('Rally.data.custom.Store',{
            data: changes,
            limit: 'Infinity',
            pageSize: 5000,
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
