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
const SMA = require('technicalindicators').SMA
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

const checkInterval:number = 6;

class CandleInfo {
  pricePlace:number;
  candleArray:Array<Array<number>>;
  highArray :Array<number>;
  lowArray :Array<number>;
  closeArray :Array<number>;
  recentSignal:POSITION_SIDE;
  signalTimeStamp:number;
  sma20Array:Array<number>;
  sma50Array:Array<number>;
  sma100Array:Array<number>;
  sma200Array:Array<number>;
  sendMsgTimeStamp:number = 0;
  standardIndex:number = 0;
  tempStandardIndex:number = 0;
  stochastic:Array<any>;
  //smaPeriod:number = 14;
  lengthGap:number = 1;

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
        let input = {
          high: this.highArray,
          low: this.lowArray,
          close: this.closeArray,
          period: 14,
          signalPeriod: 3
        };
        this.stochastic = Stochastic.calculate(input);
        this.sma20Array = SMA.calculate({period : 20, values : this.closeArray})
        this.sma50Array = SMA.calculate({period : 50, values : this.closeArray})
        this.sma100Array = SMA.calculate({period : 100, values : this.closeArray})
        this.sma200Array = SMA.calculate({period : 200, values : this.closeArray})
      } catch (e) {
        
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
        // let maxLength = Math.max(this.highArray.length, this.lowArray.length, this.closeArray.length)
        // let input = {
        //   high: this.highArray.slice(maxLength - this.highArray.length),
        //   low: this.lowArray.slice(maxLength - this.highArray.length),
        //   close: this.closeArray.slice(maxLength - this.highArray.length),
        //   period: 14,
        //   signalPeriod: 3
        // };
        let input = {
          high: this.highArray,
          low: this.lowArray,
          close: this.closeArray,
          period: 14,
          signalPeriod: 3
        };
        this.stochastic = Stochastic.calculate(input);
        this.sma20Array = SMA.calculate({period : 20, values : this.closeArray})
        this.sma50Array = SMA.calculate({period : 50, values : this.closeArray})
        this.sma100Array = SMA.calculate({period : 100, values : this.closeArray})
        this.sma200Array = SMA.calculate({period : 200, values : this.closeArray})
      } catch (e) {
        SendNotiMsg(`체크에러\n${e}`);
        let i = 0;
      }
  }

  // public ClearContinuousArray()
  // {
  //     this.continuousLongTimeStampArray.length = 0;
  //     this.continuousShortTimeStampArray.length = 0;
  // }

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
      // if(side == POSITION_SIDE.LONG)
      // {
      //     return this.continuousLongTimeStampArray[this.continuousLongTimeStampArray.length-1];
      // }
      // else if(side == POSITION_SIDE.SHORT)
      // {
      //     return this.continuousShortTimeStampArray[this.continuousShortTimeStampArray.length-1];
      // }
      // return 0;
  }

  public GetOpenPosion() : POSITION_SIDE
  {
    // 상승추세(정배열)
    if(this.sma20Array[this.sma20Array.length-this.lengthGap] > this.sma50Array[this.sma50Array.length-this.lengthGap]
      && this.sma50Array[this.sma50Array.length-this.lengthGap] > this.sma100Array[this.sma100Array.length-this.lengthGap]
      && this.sma100Array[this.sma100Array.length-this.lengthGap] > this.sma200Array[this.sma200Array.length-this.lengthGap])
      {
        // 20일선 기울기 상승
        if(this.sma20Array[this.sma20Array.length-this.lengthGap] >= this.sma20Array[this.sma20Array.length-(this.lengthGap+1)]
          && this.sma20Array[this.sma20Array.length-(this.lengthGap+1)] >= this.sma20Array[this.sma20Array.length-(this.lengthGap+2)]
          && this.sma20Array[this.sma20Array.length-(this.lengthGap+2)] >= this.sma20Array[this.sma20Array.length-(this.lengthGap+3)])
        {
          // stochastic 20이하 이면서 k가 d보다 위인 경우
          if(this.stochastic[this.stochastic.length-this.lengthGap].d < 20
            && this.stochastic[this.stochastic.length-this.lengthGap].k > this.stochastic[this.stochastic.length-this.lengthGap].d)
            {
              return POSITION_SIDE.LONG;
            }
        }
      }
    // 하락추세(정배열)
    else if(this.sma20Array[this.sma20Array.length-this.lengthGap] < this.sma50Array[this.sma50Array.length-this.lengthGap]
      && this.sma50Array[this.sma50Array.length-this.lengthGap] < this.sma100Array[this.sma100Array.length-this.lengthGap]
      && this.sma100Array[this.sma100Array.length-this.lengthGap] < this.sma200Array[this.sma200Array.length-this.lengthGap])
      {
        // 20일선 기울기 하락
        if(this.sma20Array[this.sma20Array.length-this.lengthGap] <= this.sma20Array[this.sma20Array.length-(this.lengthGap+1)]
          && this.sma20Array[this.sma20Array.length-(this.lengthGap+1)] <= this.sma20Array[this.sma20Array.length-(this.lengthGap+2)]
          && this.sma20Array[this.sma20Array.length-(this.lengthGap+2)] <= this.sma20Array[this.sma20Array.length-(this.lengthGap+3)])
        {
          // stochastic 80이상 이면서 k가 d보다 아래인 경우
          if(this.stochastic[this.stochastic.length-this.lengthGap].d > 80
            && this.stochastic[this.stochastic.length-this.lengthGap].k < this.stochastic[this.stochastic.length-this.lengthGap].d)
            {
              return POSITION_SIDE.SHORT;
            }
        }
      }

    return POSITION_SIDE.NONE;
  }

  public GetBreakThroughBox3() : POSITION_SIDE
  {
      this.tempStandardIndex = this.standardIndex;
      if(this.candleArray[this.candleArray.length-1][CANDLE_INDEX.HIGH] >= this.candleArray[this.standardIndex][CANDLE_INDEX.HIGH]
          || this.candleArray[this.candleArray.length-1][CANDLE_INDEX.LOW] <= this.candleArray[this.standardIndex][CANDLE_INDEX.LOW])
      {
          if(this.candleArray[this.candleArray.length-1][CANDLE_INDEX.HIGH] > this.candleArray[this.standardIndex][CANDLE_INDEX.HIGH]
              || this.candleArray[this.candleArray.length-1][CANDLE_INDEX.LOW] < this.candleArray[this.standardIndex][CANDLE_INDEX.LOW])
          {
              this.standardIndex = this.candleArray.length-1;
          }

          if(((this.candleArray.length-1) - this.tempStandardIndex) < 5)
              return POSITION_SIDE.NONE;

          if(this.sendMsgTimeStamp != 0)
          {
              if(this.GetCurrentTimeStamp(false) - this.sendMsgTimeStamp < (1 * (1000 * 60 * 30)))
                  return POSITION_SIDE.NONE;
          }

          let _isTempStandardCandlePositive:boolean = (this.candleArray[this.tempStandardIndex][CANDLE_INDEX.CLOSE] - this.candleArray[this.tempStandardIndex][CANDLE_INDEX.OPEN]) >= 0;
          if(_isTempStandardCandlePositive)
          {
              if(this.candleArray[this.candleArray.length-1][CANDLE_INDEX.LOW] <= this.candleArray[this.tempStandardIndex][CANDLE_INDEX.LOW])
              {
                  return POSITION_SIDE.LONG;
              }
          }
          else
          {
              if(this.candleArray[this.candleArray.length-1][CANDLE_INDEX.HIGH] >= this.candleArray[this.tempStandardIndex][CANDLE_INDEX.HIGH])
              {
                  return POSITION_SIDE.SHORT;
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
    let symbol:string = event?.data[0].symbolId;
    tickersDic[symbol] = event?.data[0]
    let markPrice:number = parseFloat(event?.data[0].markPrice);
    let timestamp:number = Date.now();
    handleWsUpdateTickers(symbol, markPrice, timestamp, candle5mInfoDic, '5m')
    handleWsUpdateTickers(symbol, markPrice, timestamp, candle15mInfoDic, '15m')
    handleWsUpdateTickers(symbol, markPrice, timestamp, candle30mInfoDic, '30m')
  }
  else if(event?.arg['channel'] == 'candle5m')
  {
    handleWsUpdateCandle(event?.action, event?.arg.instId.concat('_UMCBL'), event?.data, candle5mInfoDic, '5m')
  }
  else if(event?.arg['channel'] == 'candle15m')
  {
    handleWsUpdateCandle(event?.action, event?.arg.instId.concat('_UMCBL'), event?.data, candle15mInfoDic, '15m')
  }
  else if(event?.arg['channel'] == 'candle30m')
  {
    handleWsUpdateCandle(event?.action, event?.arg.instId.concat('_UMCBL'), event?.data, candle30mInfoDic, '30m')
  }
}

async function handleWsUpdateCandle(action:string, symbol:string, data, candleInfoDic:Map<string, CandleInfo>, strCandle:string) {

  let positionSide:POSITION_SIDE = POSITION_SIDE.NONE;
  if(action == 'snapshot')
  {
    candleInfoDic.get(symbol)?.Set(data);
      //positionSide = candle5mInfoDic.get(symbol)?.GetBreakThroughBox() ?? POSITION_SIDE.NONE;
  }
  else if(action == 'update')
  {
    candleInfoDic.get(symbol)?.Push(data);
      positionSide = candleInfoDic.get(symbol)?.GetOpenPosion() ?? POSITION_SIDE.NONE;
  }

  let timestamp:number = Date.now();
  let markPrice:number = parseFloat(tickersDic[symbol].markPrice)
  if(orderInfoDic.get(symbol)?.side == POSITION_SIDE.NONE)
  {
    if(positionSide == POSITION_SIDE.LONG)
    {
      orderInfoDic.get(symbol)?.Set(POSITION_SIDE.LONG, markPrice, timestamp, strCandle);
      SendNotiMsg(`${symbol} ${strCandle} - Long진입\nTimeStamp:${new Date(timestamp)}\nPrice:${markPrice}`);
    }
    else if(positionSide == POSITION_SIDE.SHORT)
    {
      orderInfoDic.get(symbol)?.Set(POSITION_SIDE.SHORT, markPrice, timestamp, strCandle);
      SendNotiMsg(`${symbol} ${strCandle} - Short진입\nTimeStamp:${new Date(timestamp)}\nPrice:${markPrice}`);
    }
  }
  else
  {
    if(orderInfoDic.get(symbol)?.strCandle == strCandle)
    {
      if(positionSide == POSITION_SIDE.LONG && orderInfoDic.get(symbol)?.side == POSITION_SIDE.SHORT)
      {
        ++swiching;
        orderInfoDic.get(symbol)?.Set(POSITION_SIDE.LONG, markPrice, timestamp, strCandle);
        SendNotiMsg(`${symbol} ${strCandle} - Short -> Long스위칭\nTimeStamp:${new Date(timestamp)}\nPrice:${markPrice}`);
      }
      else if(positionSide == POSITION_SIDE.SHORT && orderInfoDic.get(symbol)?.side == POSITION_SIDE.LONG)
      {
        ++swiching;
        orderInfoDic.get(symbol)?.Set(POSITION_SIDE.SHORT, markPrice, timestamp, strCandle);
        SendNotiMsg(`${symbol} ${strCandle} - Long -> Short스위칭\nTimeStamp:${new Date(timestamp)}\nPrice:${markPrice}`);
      }
    }
  }
}

let leverage10 = 10
async function handleWsUpdateTickers(symbol:string, markPrice:number, timestamp:number, candleInfoDic:Map<string, CandleInfo>, strCandle:string) {

    if(orderInfoDic.get(symbol)?.strCandle != strCandle || orderInfoDic.get(symbol)?.side == POSITION_SIDE.NONE)
      return;

    if(orderInfoDic.get(symbol)?.side == POSITION_SIDE.LONG)
    {
      let stoc = candleInfoDic.get(symbol)?.stochastic;
      if(stoc != null)
      {
        if(stoc[stoc.length-1].d > 80
          && stoc[stoc.length-1].k < stoc[stoc.length-1].d)
        {
          let openPrice:number = orderInfoDic.get(symbol)?.price ?? markPrice
          let strCandleTime:string = orderInfoDic.get(symbol)?.strCandle ?? ''
          if(markPrice >= openPrice)
          {
            let persent:number = ((markPrice - openPrice) / openPrice * 100) * leverage10
            let fee:number = 0.06*leverage10
            if(persent>fee)
            {
              accumPersent += (persent-fee);
              SendNotiMsg(`${symbol} 익절(${persent-fee}%)\nTimeStamp:${new Date(timestamp)}\nPosition:롱\n승:${++win} 패:${lose} 스위칭:${swiching}\n${strCandleTime}\n누적:${accumPersent}`);
            }
            else
            {
              accumPersent -= (fee-persent);
              SendNotiMsg(`${symbol} 손절(수수료)(-${fee-persent}%)\nTimeStamp:${new Date(timestamp)}\nPosition:롱\n승:${win} 패:${++lose} 스위칭:${swiching}\n${strCandleTime}\n누적:${accumPersent}`);
            }
          }
          else
          {
            let persent:number = ((openPrice - markPrice) / openPrice * 100) * leverage10
            let fee:number = 0.06*leverage10
            accumPersent -= (persent+fee);
            SendNotiMsg(`${symbol} 손절(-${persent+fee}%)\nTimeStamp:${new Date(timestamp)}\nPosition:롱\n승:${win} 패:${++lose} 스위칭:${swiching}\n${strCandleTime}\n누적:${accumPersent}`);
          }
          orderInfoDic.get(symbol)?.ReSet();
        }
        // 10% 손절
        // else if(markPrice <= ((orderInfoDic.get(symbol)?.price ?? markPrice) * 0.99))
        // {
        //   SendNotiMsg(`${symbol} 칼손절(-10%)\nTimeStamp:${new Date(timestamp)}\nPosition:롱\n승:${win} 패:${++lose} 스위칭:${swiching}`);
        //   orderInfoDic.get(symbol)?.ReSet();
        // }
      }
    }
    else if(orderInfoDic.get(symbol)?.side == POSITION_SIDE.SHORT)
    {
      let stoc = candleInfoDic.get(symbol)?.stochastic;
      if(stoc != null)
      {
        if(stoc[stoc.length-1].d < 20
          && stoc[stoc.length-1].k > stoc[stoc.length-1].d)
        {
          let openPrice:number = orderInfoDic.get(symbol)?.price ?? markPrice
          let strCandleTime:string = orderInfoDic.get(symbol)?.strCandle ?? ''
          if(markPrice < openPrice)
          {
            let persent:number = ((openPrice - markPrice) / openPrice * 100) * leverage10
            let fee:number = 0.06*leverage10
            if(persent>fee)
            {
              accumPersent += (persent-fee);
              SendNotiMsg(`${symbol} 익절(${persent-fee}%)\nTimeStamp:${new Date(timestamp)}\nPosition:숏\n승:${++win} 패:${lose} 스위칭:${swiching}\n${strCandleTime}\n누적:${accumPersent}`);
            }
            else
            {
              accumPersent -= (fee-persent);
              SendNotiMsg(`${symbol} 손절(수수료)(-${fee-persent}%)\nTimeStamp:${new Date(timestamp)}\nPosition:롱\n승:${win} 패:${++lose} 스위칭:${swiching}\n${strCandleTime}\n누적:${accumPersent}`);
            }
          }
          else
          {
            let persent:number = ((markPrice - openPrice) / openPrice * 100) * leverage10
            let fee:number = 0.06*leverage10
            accumPersent -= (persent+fee);
            SendNotiMsg(`${symbol} 손절(-${persent+fee}%)\nTimeStamp:${new Date(timestamp)}\nPosition:숏\n승:${win} 패:${++lose} 스위칭:${swiching}\n${strCandleTime}\n누적:${accumPersent}`);
          }
          orderInfoDic.get(symbol)?.ReSet();
        }
        // 10% 손절
        // else if(markPrice >= ((orderInfoDic.get(symbol)?.price ?? markPrice) * 1.01))
        // {
        //   SendNotiMsg(`${symbol} 칼손절(-10%)\nTimeStamp:${new Date(timestamp)}\nPosition:숏\n승:${win} 패:${++lose} 스위칭:${swiching}`);
        //   orderInfoDic.get(symbol)?.ReSet();
        // }
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

async function closePosition(symbol:string, info:OrderInfo) : Promise<number>
{
  let profitLossPersent:number = 0;
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

    if(positionData.margin != '0')
    {           
      profitLossPersent = (parseFloat(positionData.unrealizedPL) / parseFloat(positionData.margin)) * 100;
    }

    const order: NewFuturesOrder = {
      marginCoin,
      orderType: 'market',
      side: info.side==1 ? 'close_long':'close_short',
      size: positionData.available,
      symbol: positionData.symbol,
    } as const;
    const result = await client.submitOrder(order);
    --totalOpenCount;
    totalAddOpenCount -= info.addOpenCount;
    //candleInfoDic.get(info.symbol)?.ClearContinuousArray();
    info.ReSet()
    return profitLossPersent
  }
  catch(e)
  {
    SendNotiMsg(
      `closeOddering /
      symbol : ${symbol}
      side : ${info.side==1 ? 'Long' : 'Short'}
      ${JSON.stringify(e)}`, () => {process.exit(1)})
  
      return profitLossPersent;
  }
}

async function openPosition(side:POSITION_SIDE, symbol:string, leverageValue:number, splitOpenValue:number, useStoploss:boolean) : Promise<boolean>
{
  let openSize:string = '0'
  try
  {
      if(splitOpenValue == 1)
          splitOpenValue = 0.95;

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

  //   if(parseFloat(symbolsInfoDic[symbol].minTradeNum) > parseFloat(openSize))
  //   {
  //     SendNotiMsg(`Side : ${side==1 ? 'Long' : 'Short'} / ${symbol} : minTradeNum${symbolsInfoDic[symbol].minTradeNum} > openSize(${openSize})`);
  //     return false;
  //   }

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
      //orderInfoDic.get(symbol)?.Set(side, 0, candle15mInfoDic.get(symbol)?.GetCurrentTimeStamp(false) ?? 0)
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
      //orderInfoDic.get(symbol)?.Set(side, 0, candle15mInfoDic.get(symbol)?.GetCurrentTimeStamp(false) ?? 0)
    }
    return true;
  }
  catch(e)
  {
  //   SendNotiMsg(
  //     `symbol : ${symbol}
  //     side : ${side==1 ? 'Long' : 'Short'}
  //     openSize : ${openSize}
  //     ${JSON.stringify(e)}`, () => {process.exit(1)})
      SendNotiMsg(
          `symbol : ${symbol}
          side : ${side==1 ? 'Long' : 'Short'}
          openSize : ${openSize}
          ${JSON.stringify(e)}`);
  }
  return false;
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
  public side : POSITION_SIDE
  public price : number
  public sumitTimeStamp : number
  public addOpenCount : number
  public strCandle : string
  
  constructor(side: POSITION_SIDE, sumitTimeStamp: number, strCandle:string)
  {
      this.Set(side, 0, sumitTimeStamp, strCandle)
  }

  Set(side: POSITION_SIDE, price:number, sumitTimeStamp: number, strCandle:string)
  {
    this.side = side
    this.price = price;
    this.sumitTimeStamp = sumitTimeStamp
    this.addOpenCount = 0
    this.strCandle = strCandle
  }
  Copy(copy:OrderInfo)
  {
    this.side = copy.side
    this.sumitTimeStamp = copy.sumitTimeStamp
    this.addOpenCount = copy.addOpenCount
  }
  ReSet()
  {
    this.side = POSITION_SIDE.NONE
    this.price = 0
    this.sumitTimeStamp = 0
    this.addOpenCount = 0
    this.strCandle = ''
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
let orderInfoDic = new Map<string, OrderInfo>();
//let lockInfoDIc = new Map<string, LockInfo>();
let lockInfo:boolean;
let candle1mInfoDic = new Map<string, CandleInfo>();
let candle3mInfoDic = new Map<string, CandleInfo>();
let candle5mInfoDic = new Map<string, CandleInfo>();
let candle15mInfoDic = new Map<string, CandleInfo>();
let candle30mInfoDic = new Map<string, CandleInfo>();
let candle1HInfoDic = new Map<string, CandleInfo>();
let totalOpenCount:number;
let totalAddOpenCount:number;
const totalOpenCountMax:number = 3;
const continuouseCheckCount:number = 3;
const openLverageValue:number = 0.15;
let win:number = 0;
let lose:number = 0;
let swiching:number = 0;
let accumPersent:number = 0;

(async () => {
  try {
    // init property
    tickersDic = {}
    symbolsInfoDic = {}
    //orderInfo = new OrderInfo('', POSITION_SIDE.NONE, 0)
    lockInfo = false;
    totalOpenCount = 0;
    totalAddOpenCount = 0;

    // Add event listeners to log websocket events on accoun
    wsClient.on('update', (data) => handleWsUpdate(data));
    wsClient.on('open', (data) => logWSEvent('open', data));
    wsClient.on('response', (data) => logWSEvent('response', data));
    wsClient.on('reconnect', (data) => logWSEvent('reconnect', data));
    wsClient.on('reconnected', (data) => logWSEvent('reconnected', data));
    //wsClient.on('authenticated', (data) => logWSEvent('authenticated', data));
    wsClient.on('exception', (data) => logWSEvent('exception', data));

    //wsClient.subscribeTopic('UMCBL', 'positions');

    //wsClient.subscribeTopic('MC', 'candle5m', 'BTCUSDT');
    //candle5mInfoDic.set('BTCUSDT', new Candle5mInfo());

    const symbolRulesResult = await client.getSymbols('umcbl');
    //symbolRulesResult.data.length
    for(var i = 0; i < symbolRulesResult.data.length; ++i)
    {
        let symbol = symbolRulesResult.data[i].symbol.split('_')[0]
        // if(symbol != 'CRVUSDT')
        //   continue
        if(symbol == 'FOOTBALLUSDT' || symbol == 'MTLUSDT' || symbol == 'USDCUSDT' || symbol == 'BGHOT10USDT' 
          || symbol == 'METAHOTUSDT' || symbol == '10000AIDOGEUSDT' || symbol == 'GFTUSDT')
         continue
        
        orderInfoDic.set(symbolRulesResult.data[i].symbol,  new OrderInfo(POSITION_SIDE.NONE, 0, ''));
        tickersDic[symbolRulesResult.data[i].symbol] = null;
        symbolsInfoDic[symbolRulesResult.data[i].symbol] = symbolRulesResult.data[i];
        candle5mInfoDic.set(symbolRulesResult.data[i].symbol, new CandleInfo());
        candle15mInfoDic.set(symbolRulesResult.data[i].symbol, new CandleInfo());
        candle30mInfoDic.set(symbolRulesResult.data[i].symbol, new CandleInfo());

         wsClient.subscribeTopic('MC', 'ticker', symbol);
         wsClient.subscribeTopic('MC', 'candle5m', symbol);
         wsClient.subscribeTopic('MC', 'candle15m', symbol);
         wsClient.subscribeTopic('MC', 'candle30m', symbol);
    }


  //   let orderInfoArray = Array.from(orderInfoDic.values());
  //   let symbolArray = Array.from(orderInfoDic.keys());
  //   while(true)
  //   {        
  //     for(var i = 0; i < orderInfoArray.length; ++i)
  //     {
  //         let orderInfo = orderInfoArray[i];
  //         let symbol = symbolArray[i];
  //         if(orderInfo.side != POSITION_SIDE.NONE)
  //         {
  //             if(lockInfo)
  //                 continue;
  
  //             // 손절 및 물타기
  //             let profitPersent = await GetCurrentProfitPersent(symbol);
  //             if(profitPersent < -10)
  //             {
  //                 let splitOpenValue = (1 / (totalOpenCountMax*2 - (totalOpenCount + totalAddOpenCount)))
  //                 if(orderInfo.addOpenCount == 0)
  //                 {
  //                     lockInfo = true;
  //                     let isOpenSucces = await openPosition(orderInfo.side, symbol, openLverageValue, splitOpenValue, false);
  //                     if(isOpenSucces)
  //                     {
  //                         orderInfo.addOpenCount = 1;
  //                         totalAddOpenCount += orderInfo.addOpenCount;
  //                         SendNotiMsg(`${symbol} Add Open\n${profitPersent}%
  //                             totalOpenCount:${totalOpenCount}, totalAddOpenCount:${totalAddOpenCount}, symbolAddCount:${orderInfo.addOpenCount}`);
  //                     }
  //                     else
  //                     {
  //                         SendNotiMsg(`${symbol} Fail Add Open\n${profitPersent}%
  //                             totalOpenCount:${totalOpenCount}, totalAddOpenCount:${totalAddOpenCount}, symbolAddCount:${orderInfo.addOpenCount}`);
  //                     }
  //                     lockInfo = false;
  //                 }
  //                 else
  //                 {
  //                     lockInfo = true;
  //                     await closePosition(symbol, orderInfo);
  //                     lockInfo = false;
  //                     SendNotiMsg(`${symbol} Force Close\n${profitPersent}%
  //                         totalOpenCount:${totalOpenCount}, totalAddOpenCount:${totalAddOpenCount}, symbolAddCount:${orderInfo.addOpenCount}`);
  //                 }
  //                 continue;
  //             }
  
  //             // 익절
  //             if(candle5mInfoDic.get(symbol)?.IsRsiClose(orderInfo.side, orderInfo.sumitTimeStamp) || candle15mInfoDic.get(symbol)?.IsRsiClose(orderInfo.side, orderInfo.sumitTimeStamp))
  //             {
  //                 lockInfo = true
  //                 await closePosition(symbol, orderInfo);
  //                 lockInfo = false
  //                 SendNotiMsg(`${symbol} realization of profit\n${profitPersent}%
  //                     totalOpenCount:${totalOpenCount}, totalAddOpenCount:${totalAddOpenCount}, symbolAddCount:${orderInfo.addOpenCount}`);
  //                 continue;
  //             }
  
  //             //let candle1mSignal = candle1mInfoDic.get(symbol)?.GetReentSignal() ?? POSITION_SIDE.NONE;
  //             let candle5mSignal = candle5mInfoDic.get(symbol)?.GetReentSignal() ?? POSITION_SIDE.NONE;
  //             let candle15mSignal = candle15mInfoDic.get(symbol)?.GetReentSignal() ?? POSITION_SIDE.NONE;
  //             // 반대방향
  //             if(orderInfo.side != candle5mSignal || orderInfo.side != candle15mSignal)
  //             {
  //                 lockInfo = true
  //                 let profitLoss = await closePosition(symbol, orderInfo);
  //                 lockInfo = false
  //                 SendNotiMsg(`${symbol} : Opposition Close\n${profitLoss}%
  //                     totalOpenCount:${totalOpenCount}, totalAddOpenCount:${totalAddOpenCount}, symbolAddCount:${orderInfo.addOpenCount}`);
  //                 continue;
  //             }
  //         }
  //         else
  //         {
  //             // 포지션 오픈
  //             if(totalOpenCount < totalOpenCountMax)
  //             {
  //                 let splitOpenValue = (1 / (totalOpenCountMax*2 - (totalOpenCount + totalAddOpenCount)))
  //                 let candle1mSignal = candle1mInfoDic.get(symbol)?.GetReentSignal() ?? POSITION_SIDE.NONE;
  //                 let candle5mSignal = candle5mInfoDic.get(symbol)?.GetReentSignal() ?? POSITION_SIDE.NONE;
  //                 let candle15mSignal = candle15mInfoDic.get(symbol)?.GetReentSignal() ?? POSITION_SIDE.NONE;
  //                 let candle1mSignalTimeStamp = candle1mInfoDic.get(symbol)?.GetRecentSignalTimeStamp() ?? 0;
  //                 let candle5mSignalTimeStamp = candle5mInfoDic.get(symbol)?.GetRecentSignalTimeStamp() ?? 0;
  //                 let candle15mSignalTimeStamp = candle15mInfoDic.get(symbol)?.GetRecentSignalTimeStamp() ?? 0;

  //                 if(candle1mSignalTimeStamp <= candle5mSignalTimeStamp && candle5mSignalTimeStamp <= candle15mSignalTimeStamp)
  //                 {
  //                     if(candle1mSignal == POSITION_SIDE.LONG && candle5mSignal == POSITION_SIDE.LONG && candle15mSignal == POSITION_SIDE.LONG)
  //                     {
  //                         if(candle15mInfoDic.get(symbol)?.IsAbleOpen(POSITION_SIDE.LONG, candle15mInfoDic.get(symbol)?.GetRecentSignalTimeStamp() ?? 0)
  //                             && candle5mInfoDic.get(symbol)?.IsAbleOpen(POSITION_SIDE.LONG, candle5mInfoDic.get(symbol)?.GetRecentSignalTimeStamp() ?? 0)
  //                             && candle1mInfoDic.get(symbol)?.IsAbleOpen(POSITION_SIDE.LONG, candle1mInfoDic.get(symbol)?.GetRecentSignalTimeStamp() ?? 0))
  //                         {
  //                             lockInfo = true
  //                             let isOpenSucces = await openPosition(POSITION_SIDE.LONG, symbol, openLverageValue, splitOpenValue, false);
  //                             if(isOpenSucces)
  //                             {
  //                                 ++totalOpenCount;
  //                                 SendNotiMsg(`${symbol} Open Long Position
  //                                     totalOpenCount:${totalOpenCount}, totalAddOpenCount:${totalAddOpenCount}, symbolAddCount:${orderInfo.addOpenCount}`);
  //                             }
  //                             else
  //                             {
  //                                 SendNotiMsg(`${symbol} Fail Open Long Position
  //                                     totalOpenCount:${totalOpenCount}, totalAddOpenCount:${totalAddOpenCount}, symbolAddCount:${orderInfo.addOpenCount}`);
  //                             }
  //                             lockInfo = false
                              
  //                         }
  //                     }
  //                     else if(candle1mSignal == POSITION_SIDE.SHORT && candle5mSignal == POSITION_SIDE.SHORT && candle15mSignal == POSITION_SIDE.SHORT)
  //                     {
  //                         if(candle15mInfoDic.get(symbol)?.IsAbleOpen(POSITION_SIDE.SHORT, candle15mInfoDic.get(symbol)?.GetRecentSignalTimeStamp() ?? 0)
  //                             && candle5mInfoDic.get(symbol)?.IsAbleOpen(POSITION_SIDE.SHORT, candle5mInfoDic.get(symbol)?.GetRecentSignalTimeStamp() ?? 0)
  //                             && candle1mInfoDic.get(symbol)?.IsAbleOpen(POSITION_SIDE.SHORT, candle1mInfoDic.get(symbol)?.GetRecentSignalTimeStamp() ?? 0))
  //                         {
  //                             lockInfo = true
  //                             let isOpenSucces = await openPosition(POSITION_SIDE.SHORT, symbol, openLverageValue, splitOpenValue, false);
  //                             if(isOpenSucces)
  //                             {
  //                                 ++totalOpenCount;
  //                                 SendNotiMsg(`${symbol} Open Short Position
  //                                     totalOpenCount:${totalOpenCount}, totalAddOpenCount:${totalAddOpenCount}, symbolAddCount:${orderInfo.addOpenCount}`);
  //                             }
  //                             else
  //                             {
  //                                 SendNotiMsg(`${symbol} Fail Open Short Position
  //                                     totalOpenCount:${totalOpenCount}, totalAddOpenCount:${totalAddOpenCount}, symbolAddCount:${orderInfo.addOpenCount}`);
  //                             }
  //                             lockInfo = false
  //                         }
  //                     }
  //                 }
  //             }
  //         }
  //     }
  //     await wait(300);
  //   }

  } catch (e) {
    console.error('request failed: ', e);
    SendNotiMsg(`error : ${e}`)
  }
})();
