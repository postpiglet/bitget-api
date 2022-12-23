import {
  FuturesClient,
  isWsFuturesAccountSnapshotEvent,
  isWsFuturesPositionsSnapshotEvent,
  NewFuturesOrder,
  WebsocketClient,
  WS_KEY_MAP,
  FuturesSymbolRule,
} from '../src';

//import technicalindic from 'technicalindicators'
import request from 'request'
const RSI = require('technicalindicators').RSI

const CANDLE_INDEX = {
    TIMESTAMP : 0,
    OPEN : 1,
    HIGH : 2,
    LOW : 3,
    CLOSE : 4,
    BVOLUME : 5,
    QVOLUME : 6
}

// read from environmental variables
const API_KEY = 'bg_c795a18f36421db7c40cd7df2c9e1b7c';
const API_SECRET = 'ecf877c45807106b2064055a8ddd7c21789fa600e98f6e2d7851e5daeaba644f';
const API_PASS = '2205qlxmrpt';

const client = new FuturesClient({
  apiKey: API_KEY,
  // apiKey: 'apiKeyHere',
  apiSecret: API_SECRET,
  // apiSecret: 'apiSecretHere',
  apiPass: API_PASS,
  // apiPass: 'apiPassHere',
});

const wsClient = new WebsocketClient({
  apiKey: API_KEY,
  apiSecret: API_SECRET,
  apiPass: API_PASS,
});

function logWSEvent(type, data) {
  console.log(new Date(), `WS ${type} event: `, data);
}

const wait = (timeToDelay) => new Promise(resolve => setTimeout(resolve, timeToDelay))
const marginCoin = 'USDT';

// WARNING: for sensitive math you should be using a library such as decimal.js!
function roundDown(value, decimals) {
  return Number(
    Math.floor(parseFloat(value + 'e' + decimals)) + 'e-' + decimals
  );
}

/** WS event handler that uses type guards to narrow down event type */
async function handleWsUpdate(event, dicSymbolTradeInfo) {
  if (isWsFuturesAccountSnapshotEvent(event)) {
    console.log(new Date(), 'ws update (account balance):', event);
    return;
  }

  if (isWsFuturesPositionsSnapshotEvent(event)) {
    console.log(new Date(), 'ws update (positions):', event);
    return;
  }

  if(event?.arg['channel'] == 'books1')
  {
    handleWsUpdateBook1(event?.data)
  }
  else if(event?.arg['channel'] == 'candle15m')
  {
    handleWsUpdateCandle15m(event?.arg['instId'], event?.data, dicSymbolTradeInfo)
  }

  //logWSEvent('update (unhandled)', event);
}

function handleWsUpdateBook1(data) {
    if(data[0].asks[0][1] > data[0].bids[0][1])
    {
        console.log('Short')
    }
    else if(data[0].asks[0][1] < data[0].bids[0][1])
    {
        console.log('Long')
    }
}
async function handleWsUpdateCandle15m(symbol:string, data, dicSymbolTradeInfo) {
    try
    {
        if(dicSymbolTradeInfo[symbol].isOrdering == true)
        return

    let rawCloseArray = data.map(x => x[CANDLE_INDEX.CLOSE])
    var inputRSI = {
        values : rawCloseArray,
        period : 14
    };
    let rsi14 = RSI.calculate(inputRSI);

    if(rsi14[rsi14.length - 1] < 15)
    {
        dicSymbolTradeInfo[symbol].isOrdering = true
        //let symbolUmcbl = symbol.concat('_UMCBL')

        const balanceResult = await client.getAccount(symbol, marginCoin);
        const accountBalance = balanceResult.data;
        if(!accountBalance.available)
            return

        const openSize = accountBalance.fixedMaxAvailable * 0.3
        if(dicSymbolTradeInfo[symbol].data.minTradeNum > openSize)
            return 

        const leverageMinMax = await client.getLeverageMinMax(symbol)
        const maxLeverage = leverageMinMax?.data['maxLeverage']
        const setLeverage = maxLeverage * 0.4

        await client.setMarginMode(symbol, marginCoin, 'fixed')
        await client.setLeverage(symbol, marginCoin, setLeverage.toString(), 'long')
        
        const order: NewFuturesOrder = {
            marginCoin,
            orderType: 'market',
            side: 'open_long',
            size: openSize.toString(),
            symbol: symbol,
            presetTakeProfitPrice : (rawCloseArray[rawCloseArray.length-1] * 1.3).toString(),
            presetStopLossPrice : (rawCloseArray[rawCloseArray.length-1] * 0.8).toString()
          } as const;

        const result = await client.submitOrder(order);
        dicSymbolTradeInfo[symbol].isOrdering = false
        SendNotiMsg(`${Date.now()}\n${symbol} Open Long Position \n${result}`);
    }
    else if(rsi14[rsi14.length - 1] > 85)
    {
        dicSymbolTradeInfo[symbol].isOrdering = true
        //let symbolUmcbl = symbol.concat('_UMCBL')

        const balanceResult = await client.getAccount(symbol, marginCoin);
        const accountBalance = balanceResult.data;
        if(!accountBalance.available)
            return

        const openSize = accountBalance.fixedMaxAvailable * 0.3
        if(dicSymbolTradeInfo[symbol].data.minTradeNum > openSize)
            return

        const leverageMinMax = await client.getLeverageMinMax(symbol)
        const maxLeverage = leverageMinMax?.data['maxLeverage']
        const setLeverage = maxLeverage * 0.4

        await client.setMarginMode(symbol, marginCoin, 'fixed')
        await client.setLeverage(symbol, marginCoin, setLeverage.toString(), 'short')
        
        const order: NewFuturesOrder = {
            marginCoin,
            orderType: 'market',
            side: 'open_short',
            size: openSize.toString(),
            symbol: symbol,
            presetTakeProfitPrice : (rawCloseArray[rawCloseArray.length-1] * 0.7).toString(),
            presetStopLossPrice : (rawCloseArray[rawCloseArray.length-1] * 1.2).toString()
          } as const;

        const result = await client.submitOrder(order);
        dicSymbolTradeInfo[symbol].isOrdering = false
        SendNotiMsg(`${Date.now()}\n${symbol} Open Short Position \n${result}`);0
    }
    } catch (e) {
        console.error('request failed: ', e);
        SendNotiMsg(`handleWsUpdateCandle15m error : ${e}`)
    }
}

const TARGET_URL = 'https://notify-api.line.me/api/notify'
const TOKEN = 'aePw7aHBRPWsXCYLPMbnqqRFJvt1b3L2HoV9VI2VjQK'

function SendNotiMsg(msg) {
    // 라인 메시지 보내기
    request.post({
    url: TARGET_URL,
    headers: {
        'Authorization': `Bearer ${TOKEN}`
    },
    form: {
        message: msg
    }
    }, (error, response, body) => {
        // 요청 완료
        console.log(body)
    })
}

/**
 * This is a simple script wrapped in a immediately invoked function expression (to execute the below workflow immediately).
 *
 * It is designed to:
 * - open a private websocket channel to log account events
 * - check for any available USDT balance in the futures account
 * - immediately open a minimum sized long position on BTCUSDT
 * - check active positions
 * - immediately send closing orders for any active futures positions
 * - check positions again
 *
 * The corresponding UI for this is at https://www.bitget.com/en/mix/usdt/BTCUSDT_UMCBL
 */

class SymbolTradeInfo {
    public isOrdering: boolean
    public data : FuturesSymbolRule

    constructor(isOrdering: boolean, data: FuturesSymbolRule) {
        this.isOrdering = isOrdering;
        this.data = data;
    }
}

(async () => {
  try {
    let dicSymbolTradeInfo = {}
    
    // Add event listeners to log websocket events on account
    wsClient.on('update', (data) => handleWsUpdate(data, dicSymbolTradeInfo));

    wsClient.on('open', (data) => logWSEvent('open', data));
    //wsClient.on('response', (data) => logWSEvent('response', data));
    wsClient.on('reconnect', (data) => logWSEvent('reconnect', data));
    wsClient.on('reconnected', (data) => logWSEvent('reconnected', data));
    wsClient.on('authenticated', (data) => logWSEvent('authenticated', data));
    wsClient.on('exception', (data) => logWSEvent('exception', data));

    // Subscribe to private account topics
    // wsClient.subscribeTopic('UMCBL', 'account');
    // // : position updates
    // wsClient.subscribeTopic('UMCBL', 'positions');
    // // : order updates
    // wsClient.subscribeTopic('UMCBL', 'orders');
    //  // : ordersAlgo updates
    // wsClient.subscribeTopic('UMCBL', 'ordersAlgo');

    // wsClient.subscribeTopic('UMCBL', 'books');
    //wsClient.subscribeTopic('UMCBL', 'trade');



    // wsClient.subscribeTopic('MC', 'candle15m', 'BTCUSDT');

    // const symbolRulesResult = await client.getSymbols('umcbl');
    // for(var i = 0; i < symbolRulesResult.data.length; ++i)
    // {
    //     let symbol = symbolRulesResult.data[i].symbol.split('_')[0]
    //     dicSymbolTradeInfo[symbol] = new SymbolTradeInfo(false, symbolRulesResult.data[i])
    //    // wsClient.subscribeTopic('MC', 'candle15m', symbol);
    // }

  

    //const symbol = 'BTCUSDT_UMCBL';

    //const aa = await client.getCandles(symbol, 15,0,0);


    // const balanceResult = await client.getAccount(symbol, marginCoin);
    // const accountBalance = balanceResult.data;
    // // const balances = allBalances.filter((bal) => Number(bal.available) != 0);
    // const usdtAmount = accountBalance.available;
    // console.log('USDT balance: ', usdtAmount);

    // if (!usdtAmount) {
    //   console.error('No USDT to trade');
    //   return;
    // }
    // const bitcoinUSDFuturesRule = symbolRulesResult.data.find(
    //   (row) => row.symbol === symbol
    // )

    const symbolRulesResult = await client.getSymbols('umcbl');
    const calcuRSI = 1000 * 60 * 15 * 100 //14 * 2;
    for(var i = 0; i < symbolRulesResult.data.length; ++i)
    {
        let symbol = symbolRulesResult.data[i].symbol
        dicSymbolTradeInfo[symbol] = new SymbolTradeInfo(false, symbolRulesResult.data[i])
       // wsClient.subscribeTopic('MC', 'candle15m', symbol);
    }
    while(true)
    {
        for(var i = 0; i < symbolRulesResult.data.length; ++i)
        {
            let now = Date.now()
            let position = await client.getPosition(symbolRulesResult.data[i].symbol, marginCoin)
            if(position.data.length == 0)
                continue
            if(position.data[0].total !== '0' || position.data[1].total !== '0')
                continue

            let candle15 = await client.getCandles(symbolRulesResult.data[i].symbol, '15m', (now - calcuRSI).toString(), now.toString())
            await handleWsUpdateCandle15m(symbolRulesResult.data[i].symbol, candle15, dicSymbolTradeInfo)
            await wait(50);
        }
    }
   

    //console.log(`aa${new Date(parseInt(candle15[0].timestamp))}`)
    // for(var i = 0; i < symbolRulesResult.data.length; ++i)
    // {
    //     let candle15 = await client.getCandles(symbolRulesResult.data[i].symbol, '15min', Date.now().toString(), Date.now().toString())
    // }

    // while(true)
    // {
    //     for(var i = 0; i < symbolRulesResult.data.length; ++i)
    //     {
    //         let tradeInfo = await client.getMarketTrades(symbolRulesResult.data[i].symbol, '100');
    //         let buyCount = 0;
    //         let sellCount = 0;
    //         for(var j = 0; j < tradeInfo.data.length; ++j)
    //         {
    //             if(tradeInfo.data[j].side == 'buy')
    //             {
    //                 // if(sellCount > 0)
    //                 //     break;
    
    //                 ++buyCount;
    
    //                 // if(buyCount == tradeInfo.data.length)
    //                 // {
    //                 //     SendNotiMsg(`${new Date(parseInt(tradeInfo.data[j].timestamp))}\n${tradeInfo.data[j].symbol} Take a long`);
    //                 // }

    //                 if((buyCount / tradeInfo.data.length) * 100 >= 80)
    //                 {
    //                     SendNotiMsg(`${new Date()}\n${tradeInfo.data[j].symbol} Take a long`);
    //                     break;
    //                 }
    //             }
    //             else if(tradeInfo.data[j].side == 'sell')
    //             {
    //                 // if(buyCount > 0)
    //                 //     break;
    
    //                 ++sellCount;
    
    //                 // if(sellCount == tradeInfo.data.length)
    //                 // {
    //                 //     SendNotiMsg(`${new Date(parseInt(tradeInfo.data[j].timestamp))}\n${tradeInfo.data[j].symbol} Take a short`);
    //                 // }

    //                 if((sellCount / tradeInfo.data.length) * 100 >= 80)
    //                 {
    //                     SendNotiMsg(`${new Date()}\n${tradeInfo.data[j].symbol} Take a short`);
    //                     break;
    //                 }
    //             }
    //         }
    
    //         await wait(50);
    //     }
    // }

    // console.log('symbol rules: ', bitcoinUSDFuturesRule);
    // if (!bitcoinUSDFuturesRule) {
    //   console.error('Failed to get trading rules for ' + symbol);
    //   return;
    // }

    // const order: NewFuturesOrder = {
    //   marginCoin,
    //   orderType: 'market',
    //   side: 'open_long',
    //   size: bitcoinUSDFuturesRule.minTradeNum,
    //   symbol,
    // } as const;

    // console.log('placing order: ', order);

    // const result = await client.submitOrder(order);

    // console.log('order result: ', result);

    // const positionsResult = await client.getPositions('umcbl');
    // const positionsToClose = positionsResult.data.filter(
    //   (pos) => pos.total !== '0'
    // );

    // console.log('open positions to close: ', positionsToClose);

    // // Loop through any active positions and send a closing market order on each position
    // for (const position of positionsToClose) {
    //   const closingSide =
    //     position.holdSide === 'long' ? 'close_long' : 'close_short';
    //   const closingOrder: NewFuturesOrder = {
    //     marginCoin: position.marginCoin,
    //     orderType: 'market',
    //     side: closingSide,
    //     size: position.available,
    //     symbol: position.symbol,
    //   };

    //   console.log('closing position with market order: ', closingOrder);

    //   const result = await client.submitOrder(closingOrder);
    //   console.log('position closing order result: ', result);
    // }

    // console.log(
    //   'positions after closing all: ',
    //   await client.getPositions('umcbl')
    // );

  } catch (e) {
    console.error('request failed: ', e);
    SendNotiMsg(`error : ${e}`)
  }
})();
