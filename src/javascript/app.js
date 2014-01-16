Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',

    logger: new Rally.technicalservices.Logger(),
    items: [
        {xtype:'container',itemId:'header_box', defaults: { padding: 5, margin: 5}, layout: { type: 'hbox'}, items:[
            {xtype:'container',itemId:'release_selector_box'},
            {xtype:'container',itemId:'release_description_box', padding: 10, tpl:'<tpl>{msg}</tpl>'}
        ]},
        {xtype:'tsinfolink'}
    ],
    launch: function() {
        this._addReleaseBox();
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
                    this.down('#release_description_box').update(this._getReleaseSummary(rb.getRecord()));
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
        var number_of_days_into_release = Rally.technicalservices.util.Utilities.daysBetween(start_js,today) + 1 ;

        var number_of_days_remaining_in_release = number_of_days_in_release - number_of_days_into_release + 1;
        
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
    }
});
