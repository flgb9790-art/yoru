package app.yoru.android;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.drawable.Drawable;
import android.os.SystemClock;
import android.view.View;

/** A lightweight first-page loading surface; no network, videos or extra Activity. */
public final class StartupView extends View {
 private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
 private final android.graphics.Path clip=new android.graphics.Path();
 private final Drawable mark;
 private final long started=SystemClock.uptimeMillis();
 public StartupView(Context context){super(context);mark=context.getDrawable(R.drawable.brand_mark);setBackgroundColor(Color.rgb(245,242,250));setContentDescription("YORU загружается");}
 @Override protected void onDraw(Canvas canvas){
  super.onDraw(canvas);float density=getResources().getDisplayMetrics().density,cx=getWidth()/2f,cy=getHeight()/2f-24*density;
  boolean motion=ValueAnimator.areAnimatorsEnabled();float phase=motion?((SystemClock.uptimeMillis()-started)%1600)/1600f:0f;
  paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(density);paint.setColor(Color.argb((int)(55*(1-phase)),139,105,180));canvas.drawCircle(cx,cy,(48+18*phase)*density,paint);
  int half=(int)(36*density);mark.setBounds((int)cx-half,(int)cy-half,(int)cx+half,(int)cy+half);canvas.save();clip.reset();clip.addRoundRect(cx-half,cy-half,cx+half,cy+half,16*density,16*density,android.graphics.Path.Direction.CW);canvas.clipPath(clip);mark.draw(canvas);canvas.restore();
  paint.setStyle(Paint.Style.FILL);paint.setColor(Color.rgb(99,77,127));paint.setTextAlign(Paint.Align.CENTER);paint.setTextSize(15*density);canvas.drawText("Y O R U",cx,cy+66*density,paint);
  if(motion&&isAttachedToWindow())postInvalidateOnAnimation();
 }
}
