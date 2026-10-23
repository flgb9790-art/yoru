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
 private final Drawable mark;
 private final long started=SystemClock.uptimeMillis();
 public StartupView(Context context){super(context);mark=context.getDrawable(R.drawable.brand_mark);setBackgroundColor(Color.rgb(245,242,250));setContentDescription("YORU загружается");}
 @Override protected void onDraw(Canvas canvas){
  super.onDraw(canvas);float density=getResources().getDisplayMetrics().density,cx=getWidth()/2f,cy=getHeight()/2f-24*density;
  boolean motion=ValueAnimator.areAnimatorsEnabled();float phase=motion?((SystemClock.uptimeMillis()-started)%1800)/1800f:0f;
  int half=(int)(36*density);mark.setBounds((int)cx-half,(int)cy-half,(int)cx+half,(int)cy+half);
  canvas.save();float scale=motion?1f+.015f*(float)Math.sin(phase*Math.PI*2):1f;canvas.scale(scale,scale,cx,cy);mark.draw(canvas);canvas.restore();
  paint.setStyle(Paint.Style.FILL);paint.setColor(Color.rgb(99,77,127));paint.setTextAlign(Paint.Align.CENTER);paint.setTextSize(14*density);canvas.drawText("Y O R U",cx,cy+62*density,paint);
  for(int i=0;i<3;i++){float wave=motion?(float)(.5+.5*Math.cos(phase*Math.PI*2-i*.9)):0.5f;paint.setColor(Color.argb((int)(65+120*wave),139,105,180));canvas.drawCircle(cx+(i-1)*10*density,cy+80*density,2*density,paint);}
  if(motion&&isAttachedToWindow())postInvalidateOnAnimation();
 }
}
