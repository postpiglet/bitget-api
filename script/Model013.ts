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
import { CandleData, rsi } from 'technicalindicators';
import { debug } from 'console';
import { boolean, env } from 'yargs';
import { match } from 'assert';
const Stochastic = require('technicalindicators').Stochastic

const CANDLE_INDEX = {
    TIMESTAMP : 0,
    OPEN : 1,
    HIGH : 2,
    LOW : 3,
    CLOSE : 4,
    BVOLUME : 5,
    END : 6
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
  else if(type == 'reconnect')
  {
      console.log("reconnect");
  }
  else if(type == 'reconnected')
  {
      console.log("reconnected");
  }
  else if(type == 'close')
  {
    SendNotiMsg(`SeEvent - close\n${data}`);
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

const checkInterval:number = 6;

class CandleInfo {
  pricePlace:number;
  candleArray:Array<Array<number>>;
  highArray :Array<number>;
  lowArray :Array<number>;
  closeArray :Array<number>;
  recentSignal:POSITION_SIDE;
  signalTimeStamp:number;
  sendMsgTimeStamp:number = 0;
  standardIndex:number = 0;
  tempStandardIndex:number = 0;
  stochastic:Array<any>;

  public Set(snapshot:Array<Array<string>>) {

      this.candleArray = [];
      this.highArray = [];
      this.lowArray = [];
      this.closeArray = [];
      this.recentSignal = POSITION_SIDE.NONE;
      this.signalTimeStamp = 0;
      this.standardIndex = 0;
      this.tempStandardIndex = 0;

      for(var i = 0; i < snapshot.length; ++i)
      {
          let candleata:Array<number> = []
          for(var j = 0; j < snapshot[i].length; ++j)
          {
              candleata.push(parseFloat(snapshot[i][j]));
          }

          this.candleArray.push(candleata)
          this.highArray.push(candleata[CANDLE_INDEX.HIGH])
          this.lowArray.push(candleata[CANDLE_INDEX.LOW])
          this.closeArray.push(candleata[CANDLE_INDEX.CLOSE])

          try
          {
              if(i != 0)
              {
                  if(candleata[CANDLE_INDEX.HIGH] > this.candleArray[this.standardIndex][CANDLE_INDEX.HIGH]
                      || candleata[CANDLE_INDEX.LOW] < this.candleArray[this.standardIndex][CANDLE_INDEX.LOW])
                  {
                      this.standardIndex = this.candleArray.length-1;
                  }
              }
          }
          catch (e)
          {
              throw e;
          }
      }
      try
      {
        let inputStoc = {
          high: this.highArray,
          low: this.lowArray,
          close: this.closeArray,
          period: 14,
          signalPeriod: 3
        };
        this.stochastic = Stochastic.calculate(inputStoc);

      } catch (e) {
        SendNotiMsg(`체크에러 set\n${e}`);
      }
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
              this.highArray[this.highArray.length-1] = candleata[CANDLE_INDEX.HIGH];
              this.lowArray[this.lowArray.length-1] = candleata[CANDLE_INDEX.LOW];
              this.closeArray[this.closeArray.length-1] = candleata[CANDLE_INDEX.CLOSE];
          }
          else if(updateCandleTimestamp > lastCandleTimestamp)
          {
              this.candleArray.shift(); // 첫번째 요소를 반환하고 제거한다.
              this.highArray.shift();
              this.lowArray.shift();
              this.closeArray.shift();
              this.standardIndex -= 1;
              let candleata:Array<number> = []
              for(var j = 0; j < update[i].length; ++j)
              {
                  candleata.push(parseFloat(update[i][j]));
              }
              this.candleArray.push(candleata);
              this.highArray.push(candleata[CANDLE_INDEX.HIGH]);
              this.lowArray.push(candleata[CANDLE_INDEX.LOW]);
              this.closeArray.push(candleata[CANDLE_INDEX.CLOSE]);
          }
      }

      try
      {
        let inputStoc = {
          high: this.highArray,
          low: this.lowArray,
          close: this.closeArray,
          period: 14,
          signalPeriod: 3
        };
        this.stochastic = Stochastic.calculate(inputStoc);
        
      } catch (e) {
        SendNotiMsg(`체크에러 push\n${e}`);
      }
  }

  public GetReentSignal() : POSITION_SIDE
  {
      return this.recentSignal;
  }

  public GetCurrentTimeStamp(isSendMsg:Boolean) : number
  {
      if(isSendMsg)
          this.sendMsgTimeStamp = this.candleArray[this.candleArray.length-1][CANDLE_INDEX.TIMESTAMP];

      return this.candleArray[this.candleArray.length-1][CANDLE_INDEX.TIMESTAMP];
  }

  public GetTempStandardIndexCandle() : Array<number>
  {
      return this.candleArray[this.tempStandardIndex];
  }

  public GetRecentSignalTimeStamp() : number
  {
      return this.signalTimeStamp;
  }

  public GetCurrentCandleArray(gap:number) : Array<number>
  {
      return this.candleArray[this.candleArray.length-gap];
  }

  public GetStocReboundOpenPosition() : [POSITION_SIDE, Array<number>]
  {
    if(this.stochastic[this.stochastic.length-2].d > 80)
    {
      if(this.stochastic[this.stochastic.length-2].d < this.stochastic[this.stochastic.length-3].d)
      {
        if(this.stochastic[this.stochastic.length-2].k < this.stochastic[this.stochastic.length-2].d)
        {
          if(this.candleArray[this.candleArray.length-2][CANDLE_INDEX.HIGH] > this.candleArray[this.candleArray.length-1][CANDLE_INDEX.HIGH])
          {
            return [POSITION_SIDE.SHORT, this.candleArray[this.candleArray.length-2]];
          }
        }
      }
    }
    else if(this.stochastic[this.stochastic.length-2].d < 20)
    {
      if(this.stochastic[this.stochastic.length-2].d > this.stochastic[this.stochastic.length-3].d)
      {
        if(this.stochastic[this.stochastic.length-2].k > this.stochastic[this.stochastic.length-2].d)
        {
          if(this.candleArray[this.candleArray.length-2][CANDLE_INDEX.LOW] < this.candleArray[this.candleArray.length-1][CANDLE_INDEX.LOW])
          {
            return [POSITION_SIDE.LONG, this.candleArray[this.candleArray.length-2]];
          }
        }
      }
    }

    return [POSITION_SIDE.NONE, Array<number>()];
  }

  public IsCloseTiming(symbol:string, info:OrderInfo|undefined) : boolean
  {
    if(info == undefined)
      return false;

    //let marketPrice = parseFloat(tickersDic[symbol].markPrice)
    switch(info.side)
    {
      case POSITION_SIDE.LONG:
        // if(marketPrice < info.deadLine)
        // {
        //   info.forceOut += 1;
        //   return true;
        // }
        return this.stochastic[this.stochastic.length-1].k >= 80;
      case POSITION_SIDE.SHORT:
        // if(marketPrice > info.deadLine)
        // {
        //   info.forceOut += 1;
        //   return true;
        // }
        return this.stochastic[this.stochastic.length-1].k <= 20;
    }

    return false;
  }

  public GetRecentLowestPrice(period:number) : number
  {
    let lowest:number = this.candleArray[this.candleArray.length-1][CANDLE_INDEX.CLOSE];
    for(var i = this.candleArray.length - period; i < this.candleArray.length; ++i)
    {
      if(lowest > this.candleArray[i][CANDLE_INDEX.LOW])
      {
        lowest = this.candleArray[i][CANDLE_INDEX.LOW];
      }
      
    }
    return lowest;
  }

  public GetRecentHighestPrice(period:number) : number
  {
    let highest:number = this.candleArray[this.candleArray.length-1][CANDLE_INDEX.CLOSE];
    for(var i = this.candleArray.length - period; i < this.candleArray.length; ++i)
    {
      if(highest < this.candleArray[i][CANDLE_INDEX.HIGH])
      {
        highest = this.candleArray[i][CANDLE_INDEX.HIGH];
      }
      
    }
    return highest;
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
    let symbol:string = event?.data[0].symbolId;
    tickersDic[symbol] = event?.data[0]
  }
  else if(event?.arg['channel'] == 'orders')
  {
    handleWsUpdateorders(event?.data[0].instId, event?.data[0])
  }
  else if(event?.arg['channel'] == 'candle5m')
  {
    handleWsUpdateCandle(event?.action, event?.arg.instId.concat('_UMCBL'), event?.data, candle5mInfoDic, '5m')
  }
}

async function handleWsUpdateorders(symbol:string, data) {
  
  try
  {
    switch(data.tS)
    {
      case 'close_long':
      case 'close_short':
      case 'reduce_close_long':
      case 'reduce_close_short':
      case 'offset_close_long':
      case 'offset_close_short':
      case 'delivery_close_long':
      case 'delivery_close_short':
      case 'burst_close_long':
      case 'burst_close_short':
        let orderInfo = orderInfoDic.get(symbol)
        if(orderInfo != null && orderInfo.side != POSITION_SIDE.NONE)
        {
          orderInfo.recentCloseTimeStamp = Date.now();
          orderInfo.ReSet();

          closeOrderIdArray.push(new FillDetailInfo(symbol, data.ordId))
        }
        break;
    }
  }
  catch (e) {
      SendNotiMsg(`에러 handleWsUpdateorders - symbol:${symbol}\n${e}`);
  }
}

async function handleWsUpdateCandle(action:string, symbol:string, data, candleInfoDic:Map<string, CandleInfo>, strCandle:string) {

  if(action == 'snapshot')
  {
    candleInfoDic.get(symbol)?.Set(data);
  }
  else if(action == 'update')
  {
    candleInfoDic.get(symbol)?.Push(data);
  }

  EnterPositionCheck(symbol, strCandle);
}

async function EnterPositionCheck(symbol:string, strCandle:string) {

  if(lock)
    return;
  
  let orderInfo:OrderInfo|undefined = orderInfoDic.get(symbol)
  if(orderInfo == undefined)
    return;

  // let recentCloseTimeStamp:number = orderInfo.recentCloseTimeStamp ?? 0
  // let recentOpenTimeStamp:number = orderInfo.recentOpenTimeStamp ?? 0
  // if(Date.now() - recentCloseTimeStamp < 1000 * 30
  //   || Date.now() - recentOpenTimeStamp < 1000 * 30)
  //   return;

  try
  {
    let candle5mInfo:CandleInfo|undefined = candle5mInfoDic.get(symbol)
    if(candle5mInfo == undefined)
      return;

    let getStocOpenPosition = candle5mInfo.GetStocReboundOpenPosition();
    if(orderInfo.side == POSITION_SIDE.NONE)
    {
      switch(getStocOpenPosition[0])
      {
        case POSITION_SIDE.LONG:
          lock = true
          await openPosition(POSITION_SIDE.LONG, symbol, (1 / (openMaxCount - openAccumCount++)), false, getStocOpenPosition[1]);
          lock = false
          break;
        case POSITION_SIDE.SHORT:
          lock = true
          await openPosition(POSITION_SIDE.SHORT, symbol, (1 / (openMaxCount - openAccumCount++)), false, getStocOpenPosition[1]);
          lock = false
          break;
      }
    }
    else
    {
      if(getStocOpenPosition[0] != POSITION_SIDE.NONE)
      {
        if(orderInfo.side != getStocOpenPosition[0])
        {
          lock = true
          await closePosition(symbol, orderInfo);
          lock = false
          return;
        }
      }

      let deadLineCandle:Array<number> = orderInfo.deadLineCanldeInfo;
      if(orderInfo.isTrend)
      {
        switch(orderInfo.side)
        {
          case POSITION_SIDE.LONG:
            if(candle5mInfo.GetCurrentCandleArray(1)[CANDLE_INDEX.CLOSE] < deadLineCandle[CANDLE_INDEX.LOW])
            {
              lock = true
              await closePosition(symbol, orderInfo);
              lock = false
            }
            break
          case POSITION_SIDE.SHORT:
            if(candle5mInfo.GetCurrentCandleArray(1)[CANDLE_INDEX.CLOSE] > deadLineCandle[CANDLE_INDEX.HIGH])
            {
              lock = true
              await closePosition(symbol, orderInfo);
              lock = false
            }
            break
        }
      }
      else
      {
        switch(orderInfo.side)
        {
          case POSITION_SIDE.LONG:
           if(candle5mInfo.GetCurrentCandleArray(2)[CANDLE_INDEX.CLOSE] < deadLineCandle[CANDLE_INDEX.LOW])
            {
              lock = true
              await closePosition(symbol, orderInfo);
              await openPosition(POSITION_SIDE.SHORT, symbol, (1 / (openMaxCount - openAccumCount++)), true, deadLineCandle);
              lock = false
            }
            break
          case POSITION_SIDE.SHORT:
           if(candle5mInfo.GetCurrentCandleArray(2)[CANDLE_INDEX.CLOSE] > deadLineCandle[CANDLE_INDEX.HIGH])
            {
              lock = true
              await closePosition(symbol, orderInfo);
              await openPosition(POSITION_SIDE.LONG, symbol, (1 / (openMaxCount - openAccumCount++)), true, deadLineCandle);
              lock = false
            }
            break
        }
      }
    }
  }
  catch (e) {
    if(Date.now() - errTimeStamp1 > 1000 * 60 * 5)
    {
      SendNotiMsg(`에러 EnterPositionCheck\n${e}`);
      errTimeStamp1 = Date.now();
    }
  }
}

async function GetCurrentProfitPersent(symbol:string) : Promise<number>{

  let getPosition = await client.getPosition(symbol, marginCoin)
  let holdSide = orderInfoDic.get(symbol)?.side == POSITION_SIDE.LONG ? 'long' : 'short'
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

async function closePosition(symbol:string, info:OrderInfo|undefined)
{
  if(info == undefined)
  {
    throw 'info is undefined!!';
  }

  //forTest
  // let orderInfo:OrderInfo|undefined = orderInfoDic.get(symbol);
  // if(orderInfo!=undefined)
  // {
  //   let openPrice = orderInfo.openPrice
  //   let margetPrice = parseFloat(tickersDic[symbol].markPrice)
  //   let feePersent:number = 0.06*orderInfo.leverage
  //   if(orderInfo.side == POSITION_SIDE.LONG)
  //   {
  //     let persent:number = ((margetPrice - openPrice) / openPrice * 100) * orderInfo.leverage
  //     persent -= feePersent
  //     accumPersent+=persent
  //     if(persent>=0)
  //     {
  //       orderInfo.forceOut = 0
  //       SendNotiMsg(`${symbol.split('_')[0]}\n- 익절(${persent.toFixed(2)}%)\nPosition:${orderInfo.side}\nTimeStamp:${new Date(Date.now())})}\n누적퍼센트:${accumPersent}%`);
  //     }
  //     else
  //     {
  //       orderInfo.forceOut += 1
  //       SendNotiMsg(`${symbol.split('_')[0]}\n- 손절(${persent.toFixed(2)}%)\nPosition:${orderInfo.side}\nTimeStamp:${new Date(Date.now())})}\n누적퍼센트:${accumPersent}%`);
  //     }
  //   }
  //   else if(orderInfo.side == POSITION_SIDE.SHORT)
  //   {
  //     let persent:number = ((openPrice - margetPrice) / openPrice * 100) * orderInfo.leverage
  //     persent -= feePersent
  //     accumPersent+=persent
  //     if(persent>=0)
  //     {
  //       orderInfo.forceOut = 0
  //       SendNotiMsg(`${symbol.split('_')[0]}\n- 익절(${persent.toFixed(2)}%)\nPosition:${orderInfo.side}\nTimeStamp:${new Date(Date.now())})}\n누적퍼센트:${accumPersent}%`);
  //     }
  //     else
  //     {
  //       orderInfo.forceOut += 1
  //       SendNotiMsg(`${symbol.split('_')[0]}\n- 손절(${persent.toFixed(2)}%)\nPosition:${orderInfo.side}\nTimeStamp:${new Date(Date.now())})}\n누적퍼센트:${accumPersent}%`);
  //     }
  //   }
  //   orderInfo.recentCloseTimeStamp = Date.now();
  //   orderInfo.openPrice = 0
  //   orderInfo.ReSet();
  //   --openAccumCount
  // }
  // return
  /////////////////

  try
  {
    let getPosition = await client.getPosition(symbol, marginCoin)
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
      marginCoin: marginCoin,
      orderType: 'market',
      side: info.side==1 ? 'close_long':'close_short',
      size: positionData.available,
      symbol: positionData.symbol,
    } as const;
    const result = await client.submitOrder(order);
  }
  catch(e)
  {
    SendNotiMsg(
      `closeOrdering /
      symbol : ${symbol}
      ${JSON.stringify(e)}`)
  }
}
 
async function openPosition(side:POSITION_SIDE, symbol:string, splitOpenValue:number, isTrend:boolean, deadLineCanldeInfo:Array<number>)
{
  let openSize:string = '0'
  let orderInfo:OrderInfo|undefined = orderInfoDic.get(symbol);

  try
  {
    splitOpenValue = Math.floor(splitOpenValue * 100) / 100;
    let forceOut:number = orderInfo?.forceOut ?? 0
    let leverageMinMax = await client.getLeverageMinMax(symbol)
    let maxLeverage:number = parseInt(leverageMinMax?.data['maxLeverage'])
    let customLeverageRatio = openLeverageRatio + forceOut*0.05;
    let setLeverage:number = Math.ceil(maxLeverage * customLeverageRatio)

    //forTest
    // if(orderInfo!=undefined)
    // {
    //   let markPrice = parseFloat(tickersDic[symbol].markPrice)
    //   orderInfo.Set(side, stringCandle, setLeverage)
    //   orderInfo.openPrice = markPrice
    //   orderInfo.recentOpenTimeStamp = Date.now();
    //   SendNotiMsg(`${symbol.split('_')[0]}\n${stringCandle} - ${side==1?'Long진입':'Short진입'}\nTimeStamp:${new Date(Date.now())}\nPrice:${markPrice}\n추가배율:${forceOut}\nOpenAccumCount:${openAccumCount}`);
    // }
    // return
    ///////////////////

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
      return;
    }

    const order: NewFuturesOrder = {
      marginCoin: marginCoin,
      orderType: 'market',
      side: side==1 ? 'open_long':'open_short',
      size: openSize,
      symbol: symbol,
      //presetTakeProfitPrice: presetTakeProfitPrice.toString(),
      //presetStopLossPrice: lastLinePrice.toString(),op
      //presetStopLossPrice: presetStopLossPrice.toString(),
    } as const;
    const result = await client.submitOrder(order);

    let timestm:number = Date.now()
    if(orderInfo != undefined)
    {
      orderInfo.recentOpenTimeStamp = timestm;
      orderInfo.Set(side, setLeverage, isTrend, deadLineCanldeInfo);
    }
    SendNotiMsg(`${symbol.split('_')[0]}\n- (${isTrend==true?'추세':'반등'})${side==1?'Long진입':'Short진입'}\nTimeStamp:${new Date(timestm)}\nPrice:${marketPrice}\n배율:${setLeverage}\nOpenAccumCount:${openAccumCount}`);
  }
  catch(e)
  {
    --openAccumCount
    if(Date.now() - errTimeStampOpen > 1000 * 60 * 5)
    {
      errTimeStampOpen = Date.now();
      SendNotiMsg(
          `symbol : ${symbol}
          side : ${side==1 ? 'Long' : 'Short'}
          openSize : ${openSize}
          ${JSON.stringify(e)}`)

    }
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

class SubOrderInfo {
  public symbol : string
  public side : POSITION_SIDE
  public strCandle : string

  constructor(symbol:string, side: POSITION_SIDE, strCandle:string)
  {
      this.Set(symbol, side, strCandle)
  }

  Set(symbol:string, side: POSITION_SIDE, strCandle:string)
  {
    this.symbol = symbol
    this.side = side
    this.strCandle = strCandle
  }
}

class OrderInfo {
  public side : POSITION_SIDE
  public leverage : number
  public recentOpenTimeStamp : number
  public recentCloseTimeStamp : number
  public forceOut:number
  public deadLineCanldeInfo:Array<number>
  public isTrend : boolean
  // forTest
  public openPrice:number

  constructor(side: POSITION_SIDE, leverage:number)
  {
    this.recentOpenTimeStamp = 0
    this.recentCloseTimeStamp = 0
    this.forceOut = 0
    this.Set(side, leverage,false, Array<number>())
  }

  Set(side: POSITION_SIDE, leverage:number, isTrend:boolean, deadLineCanldeInfo:Array<number>)
  {
    this.side = side
    this.leverage = leverage
    this.deadLineCanldeInfo = deadLineCanldeInfo
  }
  Copy(copy:OrderInfo)
  {
    this.side = copy.side
  }
  ReSet()
  {
    this.side = POSITION_SIDE.NONE
    this.leverage = 0
    this.deadLineCanldeInfo = Array<number>()
    this.isTrend = false
  }
}

class FillDetailInfo {
  public symbol : string
  public orderID : string

  constructor(symbol : string, orderID : string)
  {
    this.symbol = symbol
    this.orderID = orderID
  }
}

let tickersDic
let symbolsInfoDic
let orderInfoDic = new Map<string, OrderInfo>();
let candle5mInfoDic = new Map<string, CandleInfo>();
//let candle1HInfoDic = new Map<string, CandleInfo>();
let openAccumCount:number = 0;
const openLeverageRatio:number = 0.1;
const openMaxCount:number = 1;
let accumProfit:number;
let lock:boolean;
let errTimeStamp1:number;
let errTimeStampOpen:number;
let closeOrderIdArray:Array<FillDetailInfo>;

//forTest
//let accumPersent:number
//////


(async () => {
  try {
    // init property
    tickersDic = {}
    symbolsInfoDic = {}
    openAccumCount = 0
    lock = false
    closeOrderIdArray = []
    accumProfit = 0
   // accumPersent = 0
    // Add event listeners to log websocket events on accoun
    wsClient.on('update', (data) => handleWsUpdate(data));
    wsClient.on('open', (data) => logWSEvent('open', data));
    wsClient.on('response', (data) => logWSEvent('response', data));
    wsClient.on('reconnect', (data) => logWSEvent('reconnect', data));
    wsClient.on('reconnected', (data) => logWSEvent('reconnected', data));
    //wsClient.on('authenticated', (data) => logWSEvent('authenticated', data));
    wsClient.on('exception', (data) => logWSEvent('exception', data));
    wsClient.on('close', (data) => logWSEvent('close', data));

    //wsClient.subscribeTopic('UMCBL', 'positions');

    wsClient.subscribeTopic('UMCBL', 'orders');
    await wait(1000);

    //lock = true
    const symbolRulesResult = await client.getSymbols('umcbl');
    for(var i = 0; i < symbolRulesResult.data.length-20; ++i)
    {
        let symbol = symbolRulesResult.data[i].symbol.split('_')[0]
        if(symbol != 'BTCUSDT')
          continue

        // if(symbol == 'FOOTBALLUSDT' || symbol == 'MTLUSDT' || symbol == 'USDCUSDT' || symbol == 'BGHOT10USDT' 
        //    || symbol == 'METAHOTUSDT' || symbol == '10000AIDOGEUSDT' || symbol == 'GFTUSDT' || symbol == 'ZZZUSDT'
        //    || symbol == '10000LADYSUSDT' || symbol == 'BLZUSDT')
        //   continue
        
        orderInfoDic.set(symbolRulesResult.data[i].symbol,  new OrderInfo(POSITION_SIDE.NONE, 0));
        tickersDic[symbolRulesResult.data[i].symbol] = null;
        symbolsInfoDic[symbolRulesResult.data[i].symbol] = symbolRulesResult.data[i];
        candle5mInfoDic.set(symbolRulesResult.data[i].symbol, new CandleInfo());
        //candle1HInfoDic.set(symbolRulesResult.data[i].symbol, new CandleInfo());

        wsClient.subscribeTopic('MC', 'ticker', symbol);
        await wait(100);
        wsClient.subscribeTopic('MC', 'candle5m', symbol);
        await wait(100);
    }

    while(true)
    {
      if(closeOrderIdArray.length != 0)
      {
        let fillDetailInfo = closeOrderIdArray.shift()
        let orderID:string = fillDetailInfo?.orderID ?? ''
        let symbol:string = fillDetailInfo?.symbol ?? ''
        let returnData = await client.getOrderFills(symbol, orderID)
        if(returnData != null)
        {
          let ctime:number = 0
          let side:string = ''
          let profit:number = 0
          let fee:number = 0
          let realProfit:number = 0
          let orderInfo = orderInfoDic.get(symbol)
          for(var i = 0; i < returnData.data.length; ++i)
          {
            let data = returnData.data[i]           
            profit += parseFloat(data?.profit??0)
            fee += parseFloat(data?.fee??0) * 2
          }
          ctime = parseInt(returnData.data[0]?.cTime??0)
          side = returnData.data[0]?.side??''
          realProfit = profit+fee
          accumProfit += realProfit        
          if(realProfit > 0)
          {
            if(orderInfo != null)
            {
              orderInfo.forceOut = 0
            }
            SendNotiMsg(`${symbol.split('_')[0]}\n- 익절(${realProfit.toFixed(8)} USDT)\nPosition:${side}\nTimeStamp:${new Date(ctime)})}\n누적:${accumProfit}`);
          }
          else
          {
            if(orderInfo != null)
            {
              orderInfo.forceOut += 1
            }
            SendNotiMsg(`${symbol.split('_')[0]}\n- 손절(${realProfit.toFixed(8)} USDT)\nPosition:${side}\nTimeStamp:${new Date(ctime)})}\n누적:${accumProfit}`);
          }
          --openAccumCount;
        }
      }
      await wait(1000);
    }

  } catch (e) {
    console.error('request failed: ', e);
    SendNotiMsg(`process err\n${JSON.stringify(e)}`)
  }
})();
