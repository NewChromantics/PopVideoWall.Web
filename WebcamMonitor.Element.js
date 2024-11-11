/*
	webcomponent for self-managing a web cam feed
*/

async function Yield(Milliseconds)
{
	let PromiseHandler = function (Resolve,Reject)
	{
		setTimeout( Resolve, Milliseconds );
	}
	let Prom = new Promise(PromiseHandler);
	return Prom;
}

const WebcamMonitorCss = `
	:host
	{
		font-family:	"Tahoma";
		display: grid;
		grid-template-areas:	"Label"
								"Error"
								"Log"
								"Video";
		grid-template-columns:	1fr;
		grid-template-rows: 	auto auto auto 1fr;
		xxbackground:red;
	}

	#Label
	{
		grid-area:	Label;
		color:		#333;
		background:	#eee;
		border:		solid 1px #ddd;
		border-radius:	0.3em;
		font-size:	8pt;
		padding:	0.5em;
		xmargin:		0.5em;
	}

	#Log
	{
		display:		none;
		grid-area:	Log;
		background:	#fff;
		overflow:	scroll;
		font-size:	70%;
		padding:	1em;
	}

	#Video
	{
		grid-area:	Video;
		background:	#333;
		display:	block;
		overflow:	hidden;
		xmargin:		0.5em;
		padding:	0.5em;
		border-radius:	0em 0em 0.5em 0.5em;

	}
	video
	{
		border-radius:	0.5em;
		background:	#0ff;
		display:	block;
		width:		100%;	/* maintains aspect ratio automatically */
	}
`;

class WebcamMonitorElement extends HTMLElement
{
	static componentName = 'webcam-monitor';
	static deviceNameAttributeName = 'device';
	static deviceUidAttributeName = 'deviceUid';
	static observedAttributes =
	[
		WebcamMonitorElement.deviceNameAttributeName,
		WebcamMonitorElement.deviceUidAttributeName,
	];
	
	#RootElement = null;
	#LabelElement = null;
	#LogElement = null;
	#Style = null;
	#VideoContainerElement = null;
	#VideoElement = null;
	//#ErrorElement = null;
	#Freed = false;
	#LogStrings = [];
	
	
	constructor()
	{
		super();
		
		const resizeObserver = new ResizeObserver( this.#OnResized.bind(this) );
		resizeObserver.observe(this);
	}
	
	get deviceName()		{	return this.getAttribute(WebcamMonitorElement.deviceNameAttributeName) ?? "";	}
	set deviceName(value)	{	this.setAttribute(WebcamMonitorElement.deviceNameAttributeName,value);	}
	get deviceUid()			{	return this.getAttribute(WebcamMonitorElement.deviceUidAttributeName);	}
	set deviceUid(value)	{	this.setAttribute(WebcamMonitorElement.deviceUidAttributeName,value);	}

	get label()				{	return this.deviceName;	}
	
	#GetCss()
	{
		return WebcamMonitorCss;
	}
	
	#OnResized()
	{
	}
	
	attributeChangedCallback(name, oldValue, newValue)
	{
		if ( name == WebcamMonitorElement.deviceAttributeName )
		{
			this.#UpdateLabel();
		}
	}
	
	connectedCallback()
	{
		//	make the map self contained with a shadow dom
		this.#RootElement = this.attachShadow({ mode: "open" });
		this.#InitLabelElement();
		this.#InitLogElement();
		this.#InitStyle();
		this.#InitVideoElement(null);
		//this.#InitCanvas();
		//this.#OnResized();	//	resize mini map to not be scrolling
		//this.#Render();
		
		//	start thread
		const ManageCameraThread = this.#ManageCameraThread();
		ManageCameraThread.catch( this.#OnError.bind(this) );
	}
	
	disconnectedCallback()
	{
		this.#Freed = true;
	}
	
	#InitStyle()
	{
		if ( this.#Style )
			return;
		
		this.#Style = document.createElement('style');
		this.#Style.textContent = this.#GetCss();
		this.#RootElement.appendChild(this.#Style);
	}
	
	#UpdateLabel()
	{
		if ( !this.#LabelElement )
			return;
		this.#LabelElement.innerText = this.label;
	}
	
	
	#InitLabelElement()
	{
		if ( this.#LabelElement )
			return;
		
		//	init controls
		this.#LabelElement = document.createElement('div');
		this.#LabelElement.id = 'Label';
		this.#RootElement.appendChild(this.#LabelElement);
		this.#UpdateLabel();
	}
	
	
	#InitLogElement()
	{
		if ( this.#LogElement )
			return;
		
		//	init controls
		this.#LogElement = document.createElement('div');
		this.#LogElement.id = 'Log';
		this.#RootElement.appendChild(this.#LogElement);
	}
	
	#InitVideoElement(Stream)
	{
		if ( !this.#VideoContainerElement )
		{
			this.#VideoContainerElement = document.createElement('div');
			this.#VideoContainerElement.id = "Video";
			this.#RootElement.appendChild(this.#VideoContainerElement);
		}
		
		if ( this.#VideoElement )
		{
			this.#VideoElement.parentElement.removeChild(this.#VideoElement);
			this.#VideoElement = null;
		}
		this.#VideoElement = document.createElement('video');//new HTMLVideoElement();
		this.#VideoContainerElement.appendChild(this.#VideoElement);
		/*
		function OnLoadedMeta(Event)
		{
			this.#OnLog('OnLoadedMeta');
			LoadedMetaPromise.Resolve(Event);
		}
		
		function OnCanPlay(Event)
		{
			Debug('OnCanPlay');
			CanPlayPromise.Resolve(Event);
		}
		
		function OnResized(Event)
		{
			Debug('OnResized');
			ResizedPromise.Resolve(Event);
		}
		
		this.VideoElement.onloadedmetadata = OnLoadedMeta;
		this.VideoElement.onloadstart = ()=>Debug('onloadstart');
		this.VideoElement.ondurationchange = ()=>Debug('ondurationchange');
		this.VideoElement.onloadeddata = ()=>Debug('onloadeddata');
		//this.VideoElement.onprogress = ()=>Debug('onprogress');
		this.VideoElement.oncanplay = OnCanPlay;
		this.VideoElement.oncanplaythrough = ()=>Debug('oncanplaythrough');
		
		this.VideoElement.addEventListener('resize',OnResized);
		*/
		this.#VideoElement.autoplay = true;
		this.#VideoElement.srcObject = Stream;
	}
	
	#OnError(Error)
	{
		this.#OnLog(`Error: ${Error}`);
		console.error(Error);
	}
	
	#OnLog(Message)
	{
		this.#LogStrings.push(Message);
		if ( !this.#LogElement )
			return;
		const MessageString = this.#LogStrings.join(`\n`);
		this.#LogElement.innerText = MessageString;
	}
	
	async #ManageCameraThread()
	{
		while ( !this.#Freed )
		{
			//	no device currently set
			if ( this.deviceName.length == 0 )
			{
				await Yield(500);
				continue;
			}
			
			const Constraints = {};
			//Constraints.audio = false;	//	false = "must not have", rather than optional
			//	gr: setting min:1 here on safari gives us video 1x1,
			//		so have some min and hopefully with no resize mode we get native camera res
			//	we may want to pick a size here and crop and scale to reduce CPU work when searching for aruco later
			Constraints.video = /*MediaTrackConstraints*/
			{
				width:	{ min: 320, ideal: 640 },
				height:	{ min: 240, ideal: 480 },
				
				//	avoid any resizing/cropping in the browser to reduce any cpu work
				//	'crop-and-scale' will resize to match ideal constraints
				resizeMode: 'none',
				
			//mandatory:
				//	{
						deviceId: this.deviceUid
					//}
			};

			this.#OnLog(`Starting device ${this.deviceName}...`);

			//const GetUserMedia = navigator.mediaDevices.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
			const Stream = await navigator.mediaDevices.getUserMedia( Constraints );
			
			this.#InitVideoElement(Stream);
			
			await Yield(900000);
		}
	}
}

customElements.define( WebcamMonitorElement.componentName, WebcamMonitorElement );
