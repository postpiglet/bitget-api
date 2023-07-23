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
  import { type } from 'os';
import { stringify } from 'querystring';
import { rsi } from 'technicalindicators';
  const RSI = require('technicalindicators').RSI
  
  const CANDLE_INDEX = {
      TIMESTAMP : 0,
      OPEN : 1,
      HIGH : 2,
      LOW : 3,
      CLOSE : 4,
      BVOLUME : 5
  }
  
  enum POSITION_SIDE {
    NONE,
    LONG,
    SHORT,
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

    if(type == 'exception')
    {
        console.log("exception");
        
      //SendNotiMsg(`soket exception\n ${data}`, () => {process.exit(1)})
    }
    else  if(type == 'reconnect')
    {
        console.log("reconnect");
    }
    else  if(type == 'reconnected')
    {
        console.log("reconnected");
    }
  }
  
  const wait = (timeToDelay) => new Promise(resolve => setTimeout(resolve, timeToDelay))
  const marginCoin = 'USDT';
  
  // WARNING: for sensitive math you should be using a library such as decimal.js!
  function roundDown(value, decimals) {
    return Number(
      Math.floor(parseFloat(value + 'e' + decimals)) + 'e-' + decimals
    );
  }

  class CandleInfo {
    candleArray:Array<Array<number>>;
    closeArray :Array<number>;
    //rsiArray:Array<number>;

    public Set(snapshot:Array<Array<string>>) {

        this.candleArray = []
        for(var i = 0; i < snapshot.length; ++i)
        {
            let candleata:Array<number> = []
            for(var j = 0; j < snapshot[i].length; ++j)
            {
                candleata.push(parseFloat(snapshot[i][j]));
            }
            this.candleArray.push(candleata)
        }
        this.closeArray = this.candleArray.map(x => x[CANDLE_INDEX.CLOSE])
    }

    public Push(update:Array<Array<string>>) {
        if(this.candleArray.length == 0)
            throw 'Candle Push error candleArray length is zero';
        
        for(var i = 0; i < update.length; ++i)
        {
            let lastCandleTimestamp = this.candleArray[this.candleArray.length-1][CANDLE_INDEX.TIMESTAMP]
            let updateCandleTimestamp = parseFloat(update[i][CANDLE_INDEX.TIMESTAMP])
            if(updateCandleTimestamp == lastCandleTimestamp)
            {
                let candleata:Array<number> = []
                for(var j = 0; j < update[i].length; ++j)
                {
                    candleata.push(parseFloat(update[i][j]));
                }
                this.candleArray[this.candleArray.length-1] = candleata;
                this.closeArray[this.closeArray.length-1] = candleata[CANDLE_INDEX.CLOSE];
            }
            else if(updateCandleTimestamp > lastCandleTimestamp)
            {
                this.candleArray.shift(); // 첫번째 요소를 반환하고 제거한다.
                this.closeArray.shift();
                let candleata:Array<number> = []
                for(var j = 0; j < update[i].length; ++j)
                {
                    candleata.push(parseFloat(update[i][j]));
                }
                this.candleArray.push(candleata);
                this.closeArray.push(candleata[CANDLE_INDEX.CLOSE]);
            }
        }
    }
    public GetCurrentRSI() {
        let inputRSI = {
            values : this.closeArray,
            period : 14
        };
        let rsiArray = RSI.calculate(inputRSI);
        return rsiArray[rsiArray.length-1]
    }

    public GetOpenPosition() {
        
        let inputRSI = {
            values : this.closeArray,
            period : 14
        };
        let rsiArray;

        // 전전 양캔들
        if(this.candleArray[this.candleArray.length-3][CANDLE_INDEX.CLOSE] - this.candleArray[this.candleArray.length-3][CANDLE_INDEX.OPEN] > 0)
        {
            // 전 양캔들
            if(this.candleArray[this.candleArray.length-2][CANDLE_INDEX.CLOSE] - this.candleArray[this.candleArray.length-3][CANDLE_INDEX.OPEN] > 0)
            {
                // 캔들 최고점은 하락추세 이면서 RSI는 상승인 경우
                if(this.candleArray[this.candleArray.length-3][CANDLE_INDEX.HIGH] > this.candleArray[this.candleArray.length-2][CANDLE_INDEX.HIGH])
                {
                    rsiArray = RSI.calculate(inputRSI);
                    if(rsiArray[rsiArray.length-3] < rsiArray[rsiArray.length-2])
                    {
                        //숏 오픈
                        return POSITION_SIDE.SHORT; 
                    }
                }
            }
        }
        // 전전 음캔들
        else if(this.candleArray[this.candleArray.length-3][CANDLE_INDEX.CLOSE] - this.candleArray[this.candleArray.length-3][CANDLE_INDEX.OPEN] < 0)
        {
             // 전 음캔들
             if(this.candleArray[this.candleArray.length-2][CANDLE_INDEX.CLOSE] - this.candleArray[this.candleArray.length-3][CANDLE_INDEX.OPEN] < 0)
             {
                // 캔들 최하점은 상승추세 이면서 RSI는 하락인 경우
                if(this.candleArray[this.candleArray.length-3][CANDLE_INDEX.LOW] < this.candleArray[this.candleArray.length-2][CANDLE_INDEX.LOW])
                {
                    rsiArray = RSI.calculate(inputRSI);
                    if(rsiArray[rsiArray.length-3] > rsiArray[rsiArray.length-2])
                    {
                        //롱 오픈
                        return POSITION_SIDE.LONG;
                    }
                }
             }
        }
        return POSITION_SIDE.NONE;
    }
  }
  
  /** WS event handler that uses type guards to narrow down event type */
  async function handleWsUpdate(event) { 
  
    if (isWsFuturesAccountSnapshotEvent(event)) {
      console.log(new Date(), 'ws update (account balance):', event);
      return
    }
  
    if (isWsFuturesPositionsSnapshotEvent(event)) {
      console.log(new Date(), 'ws update (positions):', event);
    }
  
    if(event?.arg['channel'] == 'ticker')
    {
      handleWsUpdateTickers(event?.data[0])
    }
    else if(event?.arg['channel'] == 'positions')
    {
      handleWsUpdatePosition(event?.data)
    }
    else if(event?.arg['channel'] == 'candle5m')
    {
        handleWsUpdateCandle15m(event?.action, event?.arg.instId.concat('_UMCBL'), event?.data)
    }
  }

  async function handleWsUpdateCandle15m(action:string, symbol:string, data) {
  
    if(action == 'snapshot')
    {
        candleInfoDic.get(symbol)?.Set(data);
    }
    else if(action == 'update')
    {
        candleInfoDic.get(symbol)?.Push(data);
    }

    if(lockInfo.openPosition || lockInfo.closePosition)
      return

    switch(candleInfoDic.get(symbol)?.GetOpenPosition())
    {
      case POSITION_SIDE.LONG:
        if(orderInfo.side == POSITION_SIDE.SHORT)
        {
          lockInfo.closePosition = true
          await closePosition(orderInfo);
          lockInfo.closePosition = false
          SendNotiMsg(`${symbol} : Opposition Close`)
        }
        else if(orderInfo.side == POSITION_SIDE.NONE)
        {
          lockInfo.openPosition = true
          await openPosition(POSITION_SIDE.LONG, symbol, 0.16, 0.25, false);
          lockInfo.openPosition = false
          SendNotiMsg(`${symbol} Open Long Position`)
        }
        else if(orderInfo.side == POSITION_SIDE.LONG)
        {
            if(orderInfo.addOpenCount == 0)
            {
                let profit = await GetCurrentProfitPersent();
                if(profit < -10)
                {
                    orderInfo.addOpenCount += 1
                    lockInfo.openPosition = true
                    await openPosition(POSITION_SIDE.LONG, symbol, 0.16, 0.33, false);
                    lockInfo.openPosition = false
                    SendNotiMsg(`${symbol} Open Add Long Position`)
                }
            }
            else if(orderInfo.addOpenCount == 1)
            {
                let profit = await GetCurrentProfitPersent();
                if(profit < -30)
                {
                    orderInfo.addOpenCount += 1
                    lockInfo.openPosition = true
                    await openPosition(POSITION_SIDE.LONG, symbol, 0.16, 0.5, false);
                    lockInfo.openPosition = false
                    SendNotiMsg(`${symbol} Open Add Long Position`)
                }
            }
            else if(orderInfo.addOpenCount == 2)
            {
                let profit = await GetCurrentProfitPersent();
                if(profit < -50)
                {
                    orderInfo.addOpenCount += 1
                    lockInfo.openPosition = true
                    await openPosition(POSITION_SIDE.LONG, symbol, 0.16, 0.98, false);
                    lockInfo.openPosition = false
                    SendNotiMsg(`${symbol} Open Add Long Position`)
                }
            }
        }
        break;
      case POSITION_SIDE.SHORT:
        if(orderInfo.side == POSITION_SIDE.LONG)
        {
          lockInfo.closePosition = true
          await closePosition(orderInfo);
          lockInfo.closePosition = false
          SendNotiMsg(`${symbol} : Opposition Close`)
        }
        else if(orderInfo.side == POSITION_SIDE.NONE)
        {
          lockInfo.openPosition = true
          await openPosition(POSITION_SIDE.SHORT, symbol, 0.16, 0.25, false);
          lockInfo.openPosition = false
          SendNotiMsg(`${symbol} Open Short Position`)
        }
        else if(orderInfo.side == POSITION_SIDE.SHORT)
        {
            if(orderInfo.addOpenCount == 0)
            {
                let profit = await GetCurrentProfitPersent();
                if(profit < -10)
                {
                    orderInfo.addOpenCount += 1
                    lockInfo.openPosition = true
                    await openPosition(POSITION_SIDE.SHORT, symbol, 0.16, 0.33, false);
                    lockInfo.openPosition = false
                    SendNotiMsg(`${symbol} Open Add Short Position`)
                }
            }
            else if(orderInfo.addOpenCount == 1)
            {
                let profit = await GetCurrentProfitPersent();
                if(profit < -30)
                {
                    orderInfo.addOpenCount += 1
                    lockInfo.openPosition = true
                    await openPosition(POSITION_SIDE.SHORT, symbol, 0.16, 0.5, false);
                    lockInfo.openPosition = false
                    SendNotiMsg(`${symbol} Open Add Short Position`)
                }
            }
            else if(orderInfo.addOpenCount == 2)
            {
                let profit = await GetCurrentProfitPersent();
                if(profit < -50)
                {
                    orderInfo.addOpenCount += 1
                    lockInfo.openPosition = true
                    await openPosition(POSITION_SIDE.SHORT, symbol, 0.16, 0.98, false);
                    lockInfo.openPosition = false
                    SendNotiMsg(`${symbol} Open Add Short Position`)
                }
            }
        }
        break;
    }
  }
  
  async function handleWsUpdatePosition(data) {
    if(data.length == 0)
    {
      orderInfo.ReSet();
    }
    else
    {
        if(orderInfo.side == POSITION_SIDE.NONE)
        {
            let symbol : string = data[0].instId;
            let side : POSITION_SIDE = data[0].holdSide == 'long' ? POSITION_SIDE.LONG : POSITION_SIDE.SHORT;
            let utime : number =  parseInt(data[0].uTime);
            orderInfo.Set(symbol, side, utime);
        }
    }
  }
  
  async function handleWsUpdateTickers(data) {
    tickersDic[data.symbolId] = data
  }

  async function GetCurrentProfitPersent() : Promise<number>{

    let getPosition = await client.getPosition(orderInfo.symbol, marginCoin)
    let holdSide = orderInfo.side == POSITION_SIDE.LONG ? 'long' : 'short'
    let positionData;
    let profitPersent:number = 0;

    for(var i = 0; i < getPosition.data.length; ++i)
    {
      if(getPosition.data[i].holdSide == holdSide)
        positionData = getPosition.data[i]
    }

    if(positionData.margin != '0')
    {           
        profitPersent = (parseFloat(positionData.unrealizedPL) / parseFloat(positionData.margin)) * 100;
    }
    
    return profitPersent;
  }
  
  async function closePosition(info:OrderInfo)
  {
    lockInfo.closePosition = true
    try
    {
      let getPosition = await client.getPosition(orderInfo.symbol, marginCoin)
      let positionData;
      for(var i = 0; i < getPosition.data.length; ++i)
      {
        if(info.side == POSITION_SIDE.LONG)
        {
          if(getPosition.data[i].holdSide == 'long')
          {
            positionData = getPosition.data[i]
            break
          }
        }
        else if(info.side == POSITION_SIDE.SHORT)
        {
          if(getPosition.data[i].holdSide == 'short')
          {
            positionData = getPosition.data[i]
            break
          }
        }
      }
  
      const order: NewFuturesOrder = {
        marginCoin,
        orderType: 'market',
        side: info.side==1 ? 'close_long':'close_short',
        size: positionData.available,
        symbol: positionData.symbol,
      } as const;
      const result = await client.submitOrder(order);
      //tradeQueueDic.get(info.symbol)?.Clear();
      orderInfo.ReSet()
      lockInfo.closePosition = false
    }
    catch(e)
    {
      SendNotiMsg(
        `closeOddering /
        symbol : ${info.symbol}
        side : ${info.side==1 ? 'Long' : 'Short'}
        ${JSON.stringify(e)}`, () => {process.exit(1)})
    }
  }
  
  async function openPosition(side:POSITION_SIDE, symbol:string, leverageValue:number, splitOpenValue:number, useStoploss:boolean)
  {
    lockInfo.openPosition = true
    let openSize:string = '0'
    try
    {
      let leverageMinMax = await client.getLeverageMinMax(symbol)
      let maxLeverage:number = parseInt(leverageMinMax?.data['maxLeverage'])
      let setLeverage:number = Math.ceil(maxLeverage * leverageValue)
  
      await client.setMarginMode(symbol, marginCoin, 'fixed')
      await client.setLeverage(symbol, marginCoin, setLeverage.toString(), side==1 ? 'long':'short')
  
      let accountResult = await client.getAccount(symbol, marginCoin);
      let accountData = accountResult.data;
      if(!accountData.available)
      {
        throw `Side : ${side==1 ? 'Long' : 'Short'} / ${symbol} : accountData.available${accountData.available} is not available`
      }

      let openAmount = Math.floor(accountData.fixedMaxAvailable * splitOpenValue)      
      let marketPrice = parseFloat(tickersDic[symbol].markPrice)        
      openSize = (await client.getOpenCount(symbol, marginCoin, marketPrice, openAmount, setLeverage)).data['openCount']

      if(parseFloat(symbolsInfoDic[symbol].minTradeNum) > parseFloat(openSize))
      {
        throw `Side : ${side==1 ? 'Long' : 'Short'} / ${symbol} : minTradeNum${symbolsInfoDic[symbol].minTradeNum} > openSize${openSize}`
      }
  
      if(useStoploss)
      {
        let pricePlace:number = parseInt(symbolsInfoDic[symbol].pricePlace)
        let priceEndStep:number  = parseInt(symbolsInfoDic[symbol].priceEndStep)
        let presetTakeProfitPrice:number = 0
        let presetStopLossPrice:number = 0
    
        if(side == POSITION_SIDE.LONG)
        {
          presetTakeProfitPrice = (marketPrice + ((marketPrice * (0.10)) / setLeverage))
          presetStopLossPrice = (marketPrice - ((marketPrice * (0.03)) / setLeverage))
    
          let pPowValue = Math.pow(10, pricePlace)
          let pRest:number = (parseFloat((presetTakeProfitPrice % 1).toFixed(pricePlace)) * pPowValue) % priceEndStep
          if(pRest == 0)
            presetTakeProfitPrice = parseFloat(presetTakeProfitPrice.toFixed(pricePlace))
          else
          presetTakeProfitPrice = parseFloat(presetTakeProfitPrice.toFixed(pricePlace)) + ((priceEndStep - pRest) / pPowValue)
          
          let sPowValue = Math.pow(10, pricePlace)
          let sRest:number = (parseFloat((presetStopLossPrice % 1).toFixed(pricePlace)) * sPowValue) % priceEndStep
          presetStopLossPrice = parseFloat(presetStopLossPrice.toFixed(pricePlace)) - (sRest / sPowValue)
        }
        else if(side == POSITION_SIDE.SHORT)
        {
          presetTakeProfitPrice = (marketPrice - ((marketPrice * (0.10)) / setLeverage))
          presetStopLossPrice = (marketPrice + ((marketPrice * (0.03)) / setLeverage))
    
          let pPowValue = Math.pow(10, pricePlace)
          let pRest:number = (parseFloat((presetTakeProfitPrice % 1).toFixed(pricePlace)) * pPowValue) % priceEndStep
          presetTakeProfitPrice = parseFloat(presetTakeProfitPrice.toFixed(pricePlace)) - (pRest / pPowValue)
          
          let sPowValue = Math.pow(10, pricePlace)
          let sRest:number = (parseFloat((presetStopLossPrice % 1).toFixed(pricePlace)) * sPowValue) % priceEndStep
          if(sRest == 0)
            presetStopLossPrice = parseFloat(presetStopLossPrice.toFixed(pricePlace))
          else
            presetStopLossPrice = parseFloat(presetStopLossPrice.toFixed(pricePlace)) - ((priceEndStep - sRest) / sPowValue)
        }

        const order: NewFuturesOrder = {
          marginCoin,
          orderType: 'market',
          side: side==1 ? 'open_long':'open_short',
          size: openSize,
          //size: symbolsInfoDic[symbol].minTradeNum,
          symbol: symbol,
          presetTakeProfitPrice: presetTakeProfitPrice.toString(),
          presetStopLossPrice: presetStopLossPrice.toString(),
        } as const;
        const result = await client.submitOrder(order);
        orderInfo.Set(symbol, side, result.requestTime)
      }
      else
      {
        const order: NewFuturesOrder = {
          marginCoin,
          orderType: 'market',
          side: side==1 ? 'open_long':'open_short',
          size: openSize,
          //size: symbolsInfoDic[symbol].minTradeNum,
          symbol: symbol,
          //presetTakeProfitPrice: presetTakeProfitPrice.toString(),
          //presetStopLossPrice: presetStopLossPrice.toString(),
        } as const;
        const result = await client.submitOrder(order);
        orderInfo.Set(symbol, side, result.requestTime)
      }
      lockInfo.openPosition = false
    }
    catch(e)
    {
      SendNotiMsg(
        `symbol : ${symbol}
        side : ${side==1 ? 'Long' : 'Short'}
        openSize : ${openSize}
        ${JSON.stringify(e)}`, () => {process.exit(1)})
    }
  }

  function GetCandleSize(higher:number, lower:number):number {
    return higher - lower
  }
  
  const TARGET_URL = 'https://notify-api.line.me/api/notify'
  const TOKEN = 'aePw7aHBRPWsXCYLPMbnqqRFJvt1b3L2HoV9VI2VjQK'
  
  function SendNotiMsg(msg, callBack?) {
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
          if(callBack != null)
            callBack()
      })
  }
  
  class OrderInfo {
    public symbol : string
    public side : POSITION_SIDE
    public sumitTimeStamp : number
    public bSafetyTrigger : boolean
    public addOpenCount : number
    
    constructor(symbol: string, side: POSITION_SIDE, sumitTimeStamp: number)
    {
      this.Set(symbol, side, sumitTimeStamp)
    }
  
    Set(symbol: string, side: POSITION_SIDE, sumitTimeStamp: number)
    {
      this.symbol = symbol
      this.side = side
      this.sumitTimeStamp = sumitTimeStamp
    }
    set(copy:OrderInfo)
    {
      this.symbol = copy.symbol
      this.side = copy.side
      this.sumitTimeStamp = copy.sumitTimeStamp
      this.bSafetyTrigger = copy.bSafetyTrigger
      this.addOpenCount = copy.addOpenCount
    }
    ReSet()
    {
      this.symbol = ''
      this.side = POSITION_SIDE.NONE
      this.sumitTimeStamp = 0
      this.bSafetyTrigger = false
      this.addOpenCount = 0
    }
  }
  
  class LockInfo {
    public openPosition:boolean
    public closePosition:boolean
  
    constructor(openPosition:boolean, closePosition:boolean)
    {
      this.openPosition = openPosition
      this.closePosition = closePosition
    }
  }
  
  let tickersDic
  let symbolsInfoDic
  let orderInfo:OrderInfo
  let lockInfo:LockInfo
  let candleInfoDic = new Map<string, CandleInfo>();
  
  (async () => {
    try {
      // init property
      tickersDic = {}
      symbolsInfoDic = {}
      orderInfo = new OrderInfo('', POSITION_SIDE.NONE, 0)
      lockInfo = new LockInfo(false, false)
  
      // Add event listeners to log websocket events on account
      wsClient.on('update', (data) => handleWsUpdate(data));
      wsClient.on('open', (data) => logWSEvent('open', data));
      wsClient.on('response', (data) => logWSEvent('response', data));
      wsClient.on('reconnect', (data) => logWSEvent('reconnect', data));
      wsClient.on('reconnected', (data) => logWSEvent('reconnected', data));
      //wsClient.on('authenticated', (data) => logWSEvent('authenticated', data));
      wsClient.on('exception', (data) => logWSEvent('exception', data));
  
      wsClient.subscribeTopic('UMCBL', 'positions');

      //wsClient.subscribeTopic('MC', 'candle5m', 'BTCUSDT');
      //candle5mInfoDic.set('BTCUSDT', new Candle5mInfo());

      const symbolRulesResult = await client.getSymbols('umcbl');
      for(var i = 0; i < symbolRulesResult.data.length; ++i)
      {
          let symbol = symbolRulesResult.data[i].symbol.split('_')[0]
          if(symbol != 'BTCUSDT')
            continue;
  
          wsClient.subscribeTopic('MC', 'ticker', symbol);
          wsClient.subscribeTopic('MC', 'candle5m', symbol);
          
          tickersDic[symbolRulesResult.data[i].symbol] = null
          symbolsInfoDic[symbolRulesResult.data[i].symbol] = symbolRulesResult.data[i]
          candleInfoDic.set(symbolRulesResult.data[i].symbol, new CandleInfo());
      }
  
    } catch (e) {
      console.error('request failed: ', e);
      SendNotiMsg(`error : ${e}`)
    }
  })();
  