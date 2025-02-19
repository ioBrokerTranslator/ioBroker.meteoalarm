/**
 *
 *      ioBroker Meteoalarm Adapter
 *
 *      (c) 2019 Alexander K <blacksonj7@gmail.com>
 *
 *      MIT License
 *
 */

'use strict';
const utils = require('@iobroker/adapter-core');
const request = require('request');
const moment = require('moment');
var parseString = require('xml2js').parseString;
const i18nHelper = require(`${__dirname}/lib/i18nHelper`);

var DescFilter1 = '';
var DescFilter2 = '';
var country = '';

let adapter;
let lang;

//var Interval

function startAdapter(options) {

    options = options || {};
    Object.assign(options, {
        name: 'meteoalarm',
        useFormatDate: true,
        ready: function() {
            main()
        }
    });

    adapter = new utils.Adapter(options);

    adapter.on(`unload`, callback => {
        //clearInterval(Interval);
        callback && callback();
    });

    

    return adapter;

}


function main() {

    adapter.getForeignObject('system.config', (err, systemConfig) => {
        if (!systemConfig.common.language){
            lang = 'en'
        }
        else{
            lang = systemConfig.common.language
        }
        requestXML()
    }) 
}

function checkURL(){
    var url = adapter.config.pathXML
    if (url.includes('meteoalarm.eu/documents/rss')){
        return true
    }
    else{
        adapter.log.error('URL incorrect. Please make sure to choose the RSS feed link!')
        adapter.terminate ? adapter.terminate(0) : process.exit(0);
        return false
    } 
}

function requestXML(){
    if ((adapter.config.pathXML != '') && (typeof adapter.config.pathXML != 'undefined') && (checkURL())) {
        var url = adapter.config.pathXML

        adapter.log.info('Requesting data from ' + url)
        request.post({
            url:     url,
            timeout: 8000
          }, function(error, response, body){
            if (error){
                if (error.code === 'ETIMEDOUT'){
                    adapter.log.error('Error ETIMEOUT: No website response after 8 seconds. Adapter will try again at next scheduled run.')
                    adapter.terminate ? adapter.terminate(0) : process.exit(0);
                }
                else if (error.code === 'ESOCKETTIMEDOUT'){
                    adapter.log.error('Error ESOCKETTIMEDOUT: No website response after 8 seconds. Adapter will try again at next scheduled run.')
                    adapter.terminate ? adapter.terminate(0) : process.exit(0);
                }
                else if (error.code === 'ENOTFOUND'){
                    adapter.log.error('Error ENOTFOUND: No website response after 8 seconds. Adapter will try again at next scheduled run.')
                    adapter.terminate ? adapter.terminate(0) : process.exit(0);
                }
                else(
                    adapter.log.error(error)

                )
            }
            if (body) {
                parseString(body, {
    
                    explicitArray: false,
    
                    mergeAttrs: true
    
                }, 
    
                function (err, result) {
    
                    if (err) {
    
                        adapter.log.error("Fehler: " + err);
                        adapter.terminate ? adapter.terminate(0) : process.exit(0);
                    } else {
                        processJSON(result)
                    }
                });
            }
          });    
        }
    else{
        adapter.log.debug('No path maintained!!')
        adapter.terminate ? adapter.terminate(0) : process.exit(0);
    }
    
}

function processJSON(content){

    getFilters()
    adapter.setState({device: '' , channel: '',state: 'location'}, {val: JSON.stringify(content.rss.channel.item.title), ack: true});
    adapter.log.info('Received data for ' + JSON.stringify(content.rss.channel.item.title))

    adapter.setState({device: '' , channel: '',state: 'link'}, {val: JSON.stringify(content.rss.channel.item.link), ack: true});

    var newdate = moment(new Date()).local().format('DD.MM.YYYY HH:mm')

    adapter.setState({device: '' , channel: '',state: 'lastUpdate'}, {val: newdate, ack: true});
    adapter.setState({device: '' , channel: '',state: 'publicationDate'}, {val: JSON.stringify(content.rss.channel.item.pubDate), ack: true});


    if (DescFilter1 != 'nA'){
        parseWeather(content.rss.channel.item.description,'today', function(){
            parseWeather(content.rss.channel.item.description,'tomorrow', function(){
                setTimeout(function() {
                    // wait 3 seconds to make sure all is done
                    updateHTMLWidget()
                  }, 3000);
                
            })
        })        
    }
    else{
        // Land ist nicht in der Filterliste (getfilters()) -> daher kann Text nicht gefunden werden
        adapter.log.error('The country ' + country +  ' is not set up. Please create a github issue to get it set up.')
        adapter.terminate ? adapter.terminate(0) : process.exit(0);
    }
}

function updateHTMLWidget(){
    var htmllong = '';
    var typeName = '';
    var color = '';
    var icon = '';
    var from = '';
    var to = '';
    var text = '';
    var level = '';

    adapter.getState('today.type', function (err, state) {
        typeName = getTypeName(parseInt(state.val));

    });
    adapter.getState('today.color', function (err, state) {
        color = state.val;
    });

    adapter.getState('today.level', function (err, state) {
        level = state.val;
    });

    adapter.getState('today.icon', function (err, state) {
        icon = state.val;
    });

    adapter.getState('today.from', function (err, state) {
        from = state.val;
    });

    adapter.getState('today.to', function (err, state) {
        to = state.val;
    });
    
    adapter.getState('today.text', function (err, state) {
        text = state.val;

        if (level != '1'){
            // Warnung vorhanden
            htmllong += '<div style="background:' + color + '"  border:"10px">';
            htmllong += '<div style="display: flex; align-items: center">'
            htmllong += '<img src="' +  icon + '" alt="" width="20" height="20"/> '
            htmllong += '<h3 style="margin-left: 10px;margin-top: 5px;margin-bottom: 5px;">' + typeName + '</h3> </div>' + from + ' - ' + to 
            htmllong += '</p><p>' + text + '</p></div>'
        }
        else{
            // keine Warnung vorhanden
            htmllong += '<div style="background:' + color + '"  border:"10px">';
            htmllong += '<p></p><h3> '
            htmllong += i18nHelper.NoWarning[lang] + '</h3><p>'  
            htmllong += '</p><p></p></div>'
        }
        
        adapter.setState({device: '' , channel: '',state: 'htmlToday'}, {val: htmllong, ack: true});


        let weatherDate = moment(new Date()).local().format('YYMMDD')
        var htmlweathermap = "https://meteoalarm.eu/maps/" + country.toUpperCase() + '-' + weatherDate + '.gif';

        adapter.setState({device: '' , channel: '',state: 'weatherMapCountry'}, {val: htmlweathermap, ack: true});


        setTimeout(function() {
            // wait 5 seconds to make sure all is done
            adapter.log.debug('All done')
            adapter.terminate ? adapter.terminate(0) : process.exit(0);
          }, 5000);
        
    });
}

function getTypeName(type){

    switch (type) {
        case 1:
            return i18nHelper.typeDesc1[lang]
            break;
        case 2:
            return i18nHelper.typeDesc2[lang]
            break;
        case 3:
            return i18nHelper.typeDesc3[lang]
            break;
        case 4:
            return i18nHelper.typeDesc4[lang]
            break;
        case 5:
            return i18nHelper.typeDesc5[lang]
            break;
        case 6:
            return i18nHelper.typeDesc6[lang]
            break;
        case 7:
            return i18nHelper.typeDesc7[lang]
            break;
        case 8:
            return i18nHelper.typeDesc8[lang]
            break;
        case 9:
            return i18nHelper.typeDesc9[lang]
            break;
        case 10:
            return i18nHelper.typeDesc10[lang]
            break;
        case 11:
            return 'Unknown'
            break;
        case 12:
            return i18nHelper.typeDesc12[lang]
            break;
        case 13:
            return i18nHelper.typeDesc13[lang]
            break;
        case 0:
            return ''
            break;
       default:
           return 'undefined'
           break;
    }

}

function getLevelName(level){

    switch (level) {
        case 1:
            return i18nHelper.levelDesc1[lang]
            break;
        case 2:
            return i18nHelper.levelDesc2[lang]
            break;
        case 3:
            return i18nHelper.levelDesc3[lang]
            break;
        case 4:
            return i18nHelper.levelDesc4[lang]
            break;
       default:
           return 'undefined'
           break;
    }

}

function parseWeather(description,type, callback){
    var WarnungsText = '';
    var folder = '';
    var SearchCrit1 = 0;
    var SearchCrit2 = 0;
    switch (type) {
        case 'today':
            SearchCrit1 = description.indexOf('Today') + 1;
            SearchCrit2 = description.indexOf('Tomorrow') + 1;
            folder = 'today';
           break;
       case 'tomorrow':
            SearchCrit1 = description.indexOf('Tomorrow') + 1;
            SearchCrit2 = description.length;
            folder = 'tomorrow';
           break;       
       default:
           break;
       }

    // Warning Text
    var ContentHeute = description.slice((SearchCrit1 - 1), SearchCrit2);
    SearchCrit1 = ContentHeute.indexOf(DescFilter1) + 1;
    if (SearchCrit1 != 0){
        SearchCrit1 = (typeof SearchCrit1 == 'number' ? SearchCrit1 : 0) + DescFilter1.length;
        var ContentFromDescFilter1 = ContentHeute.slice((SearchCrit1))
        SearchCrit2 = ContentFromDescFilter1.indexOf(DescFilter2) + 1;
        SearchCrit2 = (typeof SearchCrit2 == 'number' ? SearchCrit2 : 0) + -1;
        WarnungsText = ContentFromDescFilter1.slice(1, SearchCrit2);
    } 

    adapter.setState({device: '' , channel: folder,state: 'text'}, {val: WarnungsText, ack: true});

    // Warning Text From/To Today
    var Warnung_Von = ''
    var Warnung_Bis = ''
    if (ContentHeute.indexOf('From: </b><i>') != -1){
        SearchCrit1 = ContentHeute.indexOf('From: </b><i>') + 1;
        SearchCrit1 = (typeof SearchCrit1 == 'number' ? SearchCrit1 : 0) + 13;
        SearchCrit2 = ContentHeute.indexOf('CET') + 1;
        SearchCrit2 = (typeof SearchCrit2 == 'number' ? SearchCrit2 : 0) + -2;
        Warnung_Von = ContentHeute.slice((SearchCrit1 - 1), SearchCrit2);

        SearchCrit1 = ContentHeute.indexOf('Until: </b><i>') + 1;
        SearchCrit1 = (typeof SearchCrit1 == 'number' ? SearchCrit1 : 0) + 14;
        SearchCrit2 = ContentHeute.indexOf(' CET</i></td><') + 1;
        SearchCrit2 = (typeof SearchCrit2 == 'number' ? SearchCrit2 : 0) + -1;
        Warnung_Bis = ContentHeute.slice((SearchCrit1 - 1), SearchCrit2);
    }
    
    adapter.setState({device: '' , channel: folder,state: 'from'}, {val: Warnung_Von, ack: true});
    adapter.setState({device: '' , channel: folder,state: 'to'}, {val: Warnung_Bis, ack: true});


        // Warning Text  Level
        SearchCrit1 = ContentHeute.indexOf('level:') + 1;
        SearchCrit1 = (typeof SearchCrit1 == 'number' ? SearchCrit1 : 0) + 6;
        SearchCrit2 = SearchCrit1 + 1;
        var Level = parseInt(ContentHeute.charAt(SearchCrit1 - 1));
        var Color = ''
        if (SearchCrit1 != 0) {

            adapter.setState({device: '' , channel: folder,state: 'level'}, {val: Level, ack: true});
            adapter.setState({device: '' , channel: folder,state: 'levelText'}, {val: getLevelName(Level), ack: true});

        
            switch (Level) {
             case 1:
                // Grün
                Color = '#01DF3A';
                break;
            case 2:
                // Gelb
                Color = '#FEFE04';
                break;
            case 3:
                // Orange
                Color = '#FECA36';
                break;
            case 4:
                // Rot
                Color = '#FD0204';
                break;
            default:
                Color = '#ffffff';
                break;
            }

            adapter.setState({device: '' , channel: folder,state: 'color'}, {val: Color, ack: true});

        }

    //Warning Text Type
    SearchCrit1 = ContentHeute.indexOf('awt:') + 1;
    SearchCrit1 = (typeof SearchCrit1 == 'number' ? SearchCrit1 : 0) + 4;
    SearchCrit2 = SearchCrit1 + 1;
    var Typ = parseInt(ContentHeute.slice((SearchCrit1 - 1), SearchCrit2));
    if (SearchCrit1 != 0) {
        if (Level == 1){
            Typ = 0;
        }

        adapter.setState({device: '' , channel: folder,state: 'type'}, {val: Typ, ack: true});
        adapter.setState({device: '' , channel: folder,state: 'typeText'}, {val: getTypeName(Typ), ack: true});
    }
    // Icon Link:
    SearchCrit1 = ContentHeute.indexOf('src=') + 1;
    SearchCrit1 = (typeof SearchCrit1 == 'number' ? SearchCrit1 : 0) + 13;
    SearchCrit2 = ContentHeute.indexOf('alt=') + 1;
    SearchCrit2 = (typeof SearchCrit2 == 'number' ? SearchCrit2 : 0) + -3;
    var Link_temp =  ContentHeute.slice((SearchCrit1 - 1), SearchCrit2);
    Link_temp = Link_temp.slice(32);
    var Warnung_img = '/meteoalarm.admin/icons/' + Link_temp
    if (Level == 1){
        Warnung_img = '/meteoalarm.admin/icons/wflag-l1-t1.jpg'
    }

    adapter.setState({device: '' , channel: folder,state: 'icon'}, {val: Warnung_img, ack: true});

    adapter.log.debug('Loaded ' + type + ' data')
    callback()
}

function getFilters(){
    DescFilter1 = '';
    DescFilter2 = '';

    var link = adapter.config.pathXML
    var SearchCrit1 = link.indexOf('rss') + 4;
    country = link.slice((SearchCrit1), SearchCrit1 + 2)
    switch (country) {
        case 'at':
            // Österreich
            DescFilter1 = 'deutsch:';
            DescFilter2 = 'english:';
           break;
        case 'de':
                // Deutschland
                DescFilter1 = 'deutsch:';
                DescFilter2 = 'english:';
               break;
        case 'it':
            // Italien
            DescFilter1 = 'italiano:';
            DescFilter2 = '</td>';
           break;
        case 'hu':
            // Ungarn
            DescFilter1 = 'magyar:';
            DescFilter2 = 'english:';
           break;
        case 'no':
            // Norwegen
            DescFilter1 = 'norsk:';
            DescFilter2 = 'english:';
           break;
        case 'nl':
            // Niederlande
            DescFilter1 = 'nederlands:';
            DescFilter2 = 'english:';
           break;
        case 'fi':
            // Finnland
            DescFilter1 = 'suomi:';
            DescFilter2 = 'svenska:';
           break;
        case 'hr':
            // Kroatien
            DescFilter1 = 'hrvatski:';
            DescFilter2 = 'english:';
           break;
        case 'es':
            // Spanien
            DescFilter1 = 'español:';
            DescFilter2 = 'english:';
           break;
        case 'ch':
            // Switzerland
            DescFilter1 = 'english:';
            DescFilter2 = '</td>';
           break;
        case 'sk':
            // Switzerland
            DescFilter1 = 'slovenčina:';
            DescFilter2 = 'english:';
           break;
        case 'cz':
            // Czech Republic
            DescFilter1 = 'čeština:';
            DescFilter2 = 'english:';
        break;
        case 'ie':
            // Ireland
            DescFilter1 = 'english:';
            DescFilter2 = '</td>';
        break;
        case 'il':
            // Israel
            DescFilter1 = 'english:';
            DescFilter2 = '</td>';
        break;
        case 'lt':
            // Lithuania
            DescFilter1 = 'lietuviu:';
            DescFilter2 = 'english:';
        break;
        case 'lv':
            // Latvia
            DescFilter1 = 'latviešu:';
            DescFilter2 = '</td>';
        break;
        case 'me':
            // Montenegro
            DescFilter1 = 'Црногорски:';
            DescFilter2 = '</td>';
        break;
        case 'mt':
            // Malta
            DescFilter1 = 'Malti:';
            DescFilter2 = '</td>';
        break;
        case 'rs':
            // Serbia
            DescFilter1 = 'српски:';
            DescFilter2 = '</td>';
        break;
        case 'se':
            // Sweden
            DescFilter1 = 'svenska:';
            DescFilter2 = 'english:';
        break;
        case 'pl':
            // Poland
            DescFilter1 = 'polski:';
            DescFilter2 = 'english:';
        break;
        case 'md':
            // Moldova
            DescFilter1 = 'româna:';
            DescFilter2 = '</td>';
        break;
        case 'ro':
            // Romania
            DescFilter1 = 'româna:';
            DescFilter2 = 'english:';
        break;
        case 'gr':
            // Greece
            DescFilter1 = 'Ελληνικά:';
            DescFilter2 = '</td>';
        break;
        default:
                DescFilter1 = 'nA';
                DescFilter2 = 'nA';
           break;
       }
}

// If started as allInOne/compact mode => return function to create instance
if (module && module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
} 